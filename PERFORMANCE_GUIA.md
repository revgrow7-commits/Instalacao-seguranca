# Guia de Performance — Indústria Visual

Análise focada em latência percebida pelo usuário, custo de infra (Vercel + Supabase) e escalabilidade. Complementa a auditoria de falhas (`AUDITORIA_CODIGO.md`).

Os ganhos abaixo são estimativas conservadoras a partir do que observei no código. Tempos absolutos vão variar conforme tamanho do banco, mas a ordem de grandeza é confiável.

---

## Resumo: 10 ações com maior ROI

Em ordem de impacto × esforço:

| # | Ação | Impacto esperado | Esforço |
|---|---|---|---|
| 1 | Mover fotos (`checkin_photo`/`checkout_photo`) de TEXT/base64 no Postgres para Supabase Storage | Listas 5-20× mais rápidas; banco até 90% menor | Médio |
| 2 | Eliminar N+1 nas rotas de relatório (joins ou `IN (...)` em vez de loops) | Endpoints `/reports/*` 3-10× mais rápidos | Baixo |
| 3 | Substituir cache caseiro por React Query / SWR no frontend | Latência percebida cai 50-80% em telas com refetch | Médio |
| 4 | Adicionar índices compostos + parciais no Postgres | Queries de filtro 2-5× mais rápidas | Baixo |
| 5 | Operações atômicas para `coins`/`lifetime_coins` via SQL function | Elimina race condition + 1 round-trip por award | Baixo |
| 6 | Garantir Babel `visual-edits` plugin DESATIVADO em produção | Pode reduzir bundle e DOM em ~30% se estiver ativo | Baixo |
| 7 | Paginação real nas listagens (`/jobs`, `/checkins`, `/transactions`) | Cap de payload e CPU constantes mesmo com crescimento | Médio |
| 8 | Code-splitting do `recharts`/`openpyxl`/`PIL` (lazy + dynamic import) | Cold start Vercel 30-50% menor; bundle inicial menor | Baixo |
| 9 | Holdprint sync paralelo (asyncio.gather entre branches/meses) | Sync de 4 meses × 2 filiais cai de ~60s para ~10s | Baixo |
| 10 | Habilitar Supabase pooler (`pgbouncer`) e usar connection reuse | Latência por request -50-200ms em cold start | Baixo |

---

## 1. Backend (FastAPI + supabase-py)

### 1.1 N+1 queries em rotas de relatório (impacto ALTO)

Vários endpoints fazem loops chamando o banco por item. Exemplos:

**`backend/routes/gamification.py:570-587` — `get_all_redemptions`:**
```python
redemptions = db.reward_requests.find({}, {"_id": 0}, sort=[("created_at", -1)])
for redemption in redemptions:
    user = db.users.find_one({"id": redemption["user_id"]}, ...)  # 1 query por linha!
```
Para 100 redemptions = 101 queries.

**Antes (atual):**
```python
for redemption in redemptions:
    user = db.users.find_one({"id": redemption["user_id"]}, ...)
    enriched.append({**redemption, "user_name": user.get("name")})
```

**Depois:**
```python
user_ids = list({r["user_id"] for r in redemptions})
users = db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1})
users_map = {u["id"]: u for u in users}
enriched = [
    {**r, "user_name": users_map.get(r["user_id"], {}).get("name", "N/A"),
          "user_email": users_map.get(r["user_id"], {}).get("email", "N/A")}
    for r in redemptions
]
```
2 queries em vez de N+1.

**Outros pontos com o mesmo padrão (corrigir todos):**
- `routes/gamification.py:759-771` (`get_leaderboard`) — 2 queries por usuário no loop.
- `routes/notifications.py:299-303` (`notify_job_scheduled`) — 1 lookup de installer por job.
- `routes/reports.py:870-936` (`export_reports`) — já usa `jobs_map`/`installers_map` (bom), mantenha esse padrão em todas.
- `server.py:172-198` (`/location-alerts`) — 2 lookups por alerta no loop. Trocar por `IN (...)`.
- `routes/jobs.py:1051-1060` (`assign_items_to_installers`) — `db.installers.find_one` por instalador. Buscar todos de uma vez.

### 1.2 Fotos em base64 dentro do Postgres (impacto MUITO ALTO)

`item_checkins` e `checkins` guardam `checkin_photo` e `checkout_photo` como `TEXT` em base64 (~300KB cada após compressão). Toda lista que não projeta explicitamente puxa megabytes.

Sintomas observáveis:
- `/api/item-checkins/all` (admin) carrega TODOS os checkins; mesmo com projeção (`reports.py:345-349`), `find` ainda traz tudo do Postgres antes de filtrar do lado do client (supabase-py não usa `column_select` no PostgREST se passa `*`).
- `routes/checkins.py:418-448` corretamente excluí fotos da listagem (✅), mas `/api/checkins/{id}/details` e várias outras rotas trazem fotos sem necessidade.
- O banco cresce desproporcionalmente. Ao backup/restauração fica caro.

**Solução recomendada:**
1. Criar bucket `checkin-photos` no Supabase Storage.
2. No upload, converter base64 → bytes, fazer `storage.upload()` e gravar somente a URL pública (assinada se for sensível) na coluna `checkin_photo` (rename para `checkin_photo_url`).
3. Migrar registros existentes (script único).
4. Frontend já recebe URL e pode usar `<img src=...>` com cache do browser e CDN.

**Ganho:**
- Linha de `item_checkins` deixa de ter ~600KB e passa a ter ~200B (URLs).
- `find({})` em 10k checkins: de ~6GB transferidos para ~2MB.
- Build de relatório Excel: de OOM para sub-segundo.

### 1.3 Compressão de imagem síncrona dentro do request (impacto MÉDIO)

`compress_base64_image` em `routes/checkins.py:21-76` e duplicado em `routes/item_checkins.py:47-96`. PIL é CPU-bound; com foto de 4MB demora 200-500ms na thread do request.

**Mitigação (sem mover para Storage ainda):**
- Rodar a compressão em `asyncio.to_thread(compress_base64_image, ...)` para liberar o event loop.
- Melhor: comprimir no frontend antes de enviar. O navegador já faz isso bem com `canvas.toBlob({type:'image/jpeg', quality:0.7})`. Reduz upload e elimina CPU no servidor.

### 1.4 `find_one_and_update` faz 2 chamadas (impacto BAIXO-MÉDIO)

`db_supabase.py:412-414`:
```python
self.update_one(query, update)
return self.find_one(query)
```
Duas viagens ao Supabase por chamada. O PostgREST suporta `Prefer: return=representation` que devolve as linhas atualizadas no próprio UPDATE.

**Depois:**
```python
def find_one_and_update(self, query, update, ...):
    update_data = self._build_update(update)  # extrai $set/$inc
    builder = self._table().update(update_data)
    for k, v in query.items():
        builder = builder.eq(k, v)
    result = builder.execute()  # supabase-py já adiciona Prefer: return=representation
    return _deserialize(result.data[0]) if result.data else None
```
Reduz pela metade as chamadas em rotas como `assign_job`, `schedule_job`, `update_job`.

### 1.5 `$inc` e `$push` lentos e não-atômicos (impacto MÉDIO)

`db_supabase.py:357-373` — para `$inc`, lê primeiro, soma em Python, depois escreve. **Duas chamadas + race condition**.

**Antes:**
```python
existing = self.find_one(query)
update_data[field] = (existing.get(field, 0) or 0) + inc_val
```

**Depois — função SQL atômica:**
```sql
-- Migration:
CREATE OR REPLACE FUNCTION increment_coins(p_user_id uuid, p_amount int)
RETURNS TABLE(total_coins int, lifetime_coins int) AS $$
  UPDATE gamification_balances
  SET total_coins = total_coins + p_amount,
      lifetime_coins = lifetime_coins + GREATEST(p_amount, 0),
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING total_coins, lifetime_coins;
$$ LANGUAGE sql;
```
```python
result = client.rpc('increment_coins', {'p_user_id': uid, 'p_amount': 10}).execute()
```
Single round-trip, atômico, resolve a race condition descrita na auditoria (3.11).

### 1.6 JWT decode + DB lookup em CADA request (impacto MÉDIO)

`security.py:37-64` — em todo endpoint protegido, decodifica JWT (ok, é cheap) e depois faz `db.users.find({"id": user_id})`. Para um dashboard que dispara 5-10 chamadas paralelas, são 5-10 lookups de usuário.

**Mitigação:**
- Cache em memória (TTL curto, 60s) por `user_id` dentro do processo lambda.
- Ou usar dados do JWT diretamente (`role`, `email`, `id`) para a maioria das rotas, sem hit no banco — só busca o user quando precisa de campos não presentes no token (ex.: `is_active`).

```python
from cachetools import TTLCache
_user_cache = TTLCache(maxsize=1024, ttl=60)

def get_current_user(credentials):
    token = credentials.credentials
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    uid = payload.get("sub")
    if uid in _user_cache:
        return _user_cache[uid]
    user_doc = db.users.find_one({"id": uid})
    if not user_doc:
        raise credentials_exception
    user = User(**user_doc)
    _user_cache[uid] = user
    return user
```
Em Vercel cada lambda é isolado, então o cache vive por instância (~minutos). Reduz drasticamente carga no banco.

### 1.7 Holdprint sync sequencial (impacto MÉDIO)

`services/sync_holdprint.py:62-153` — loop `for branch in ["POA", "SP"]` faz syncs sequenciais. `routes/jobs.py:1577` (`sync_holdprint_jobs`) também loop aninhado branches × meses.

Cada chamada `httpx.get` espera ~1-2s. Com 4 meses × 2 filiais × 2 páginas = 16 requests = ~30s. Aproveitando que `httpx` é assíncrono:

```python
async def sync_holdprint_jobs_async(db) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        tasks = []
        for branch in ["POA", "SP"]:
            api_key = ...
            if api_key:
                tasks.append(_fetch_branch(client, branch, api_key))
        results = await asyncio.gather(*tasks, return_exceptions=True)
    # processa resultados
```
Ganho típico: 30s → 8-10s.

### 1.8 Excel export carrega tudo na memória (impacto MÉDIO)

`routes/reports.py:826-960` constrói `Workbook` com todos os checkins, jobs e installers. Para 50k linhas, ~500MB de RAM e timeout em Vercel (10s no plano hobby).

**Soluções:**
- Streaming `openpyxl` com `WriteOnlyWorkbook` (já permite append ↗ sem buffer total).
- Mover export para um job assíncrono (cron Vercel ou Edge Function); UI faz polling do status.
- Limitar período/filtro obrigatório (ex.: máximo 90 dias).

### 1.9 `select('*')` em tabelas com JSONB pesados

`backend/db_supabase.py:248,279,285` — quando o caller não passa `projection`, é `select('*')`. Tabelas como `jobs` têm `holdprint_data` (payload completo da Holdprint, pode ser MB) e `products_with_area`. Listar 1000 jobs assim = >100MB transferidos.

Forçar projeção mínima por padrão em listagens. Em `routes/jobs.py:283-292` já há projeção; replicar em todos os `find` de listagem.

### 1.10 Cold start Vercel inflado por imports pesados

`server.py` importa toda a árvore de routers no top-level → cada cold start carrega:
- `openpyxl` (`reports.py`) — ~50MB de classes, ~150ms
- `PIL` (`checkins.py`, `item_checkins.py`) — ~100ms
- `pywebpush` + `cryptography` (`notifications.py`) — ~80ms
- `googleapiclient.discovery` (`calendar.py`) — ~200ms

Total: cold start ~1.5-2s só de imports.

**Mitigação — lazy import dentro do handler:**
```python
# antes (top-level):
from openpyxl import Workbook

# depois (dentro do route):
@router.get("/reports/export")
async def export_reports(...):
    from openpyxl import Workbook   # paga o custo só quando alguém exporta
    ...
```
Mantém o app frio ~300-500ms mais rápido para todas as outras rotas.

### 1.11 `update_many` chama `update_one` (já listado em auditoria 4.14)

Para múltiplas linhas onde a query é por `eq`, PostgREST atualiza todas naturalmente. OK funcional. Mas o `_build_update` do `update_one` faz `find_one` quando há `$inc` — para `update_many`, isso fica completamente errado (pega só uma linha pra incrementar tudo). Implementar caminho separado.

### 1.12 Rate limit ausente em endpoints custosos

`/api/jobs/import-all`, `/api/reports/export`, `/api/jobs/sync-holdprint` são pesados e públicos para qualquer admin. Adicionar `slowapi`:
```python
from slowapi import Limiter
limiter = Limiter(key_func=lambda r: r.headers.get("authorization", "anon"))

@router.post("/jobs/sync-holdprint")
@limiter.limit("3/minute")
async def sync_holdprint_jobs(...):
```
Evita que um admin clicando 10× no botão derrube a Holdprint API e estoure o quota Vercel.

---

## 2. Banco de dados / Supabase

### 2.1 Índices compostos faltando

Schema atual indexa colunas únicas, mas as queries reais filtram por combinações:

| Query (arquivo) | Filtro | Índice ideal |
|---|---|---|
| `routes/checkins.py:275-279` | `(job_id, installer_id, status)` em `checkins` | `CREATE INDEX idx_checkins_active ON checkins (job_id, installer_id, status)` |
| `routes/item_checkins.py:265-270` | `(job_id, item_index, installer_id, status)` em `item_checkins` | `(job_id, installer_id) WHERE status = 'in_progress'` (parcial) |
| `routes/gamification.py:354-357` | `(reference_id, transaction_type)` em `coin_transactions` | composto |
| `routes/gamification.py:746-753` | `(amount > 0, created_at >= ?)` | parcial em created_at |
| `routes/jobs.py:339-343` | `(status='in_progress', job_id IN ...)` | parcial em status |

Exemplo:
```sql
CREATE INDEX CONCURRENTLY idx_item_checkins_active
  ON item_checkins (job_id, installer_id)
  WHERE status = 'in_progress';

CREATE INDEX CONCURRENTLY idx_jobs_unarchived
  ON jobs (created_at DESC)
  WHERE archived = false;
```
Índices parciais são pequenos e dramaticamente mais rápidos para o caso comum.

### 2.2 Falta de índice GIN para `assigned_installers` (UUID[])

Listagem de jobs do instalador faz `ANY(assigned_installers)` ou `cs.[uuid]` em PostgREST. Sem índice GIN, full scan.
```sql
CREATE INDEX idx_jobs_assigned_installers ON jobs USING GIN (assigned_installers);
```
Idem para JSONB queries:
```sql
CREATE INDEX idx_jobs_item_assignments_gin ON jobs USING GIN (item_assignments);
```

### 2.3 `holdprint_data` JSONB armazenando o payload completo

Cada job guarda o JSON cru retornado pela Holdprint (`backend/services/sync_holdprint.py:121`). Esse blob pode ser dezenas de KB e raramente é lido após a importação. Opções:

- Armazenar apenas os campos necessários em colunas tipadas; manter o cru numa tabela `jobs_raw` com TTL ou apenas auditável sob demanda.
- Comprimir com `pg_lz` via coluna calculada.
- Se realmente precisa de tudo, mover para Supabase Storage como JSON file e guardar URL.

### 2.4 Connection pooling

Verificar se a `SUPABASE_URL` em produção aponta para a porta `:6543` (Transaction pooler do Supabase) e não direto para `:5432` (DB). Em serverless, **sempre usar pooler** — caso contrário cada lambda abre conexão e o postgres satura.

### 2.5 `count_documents` ineficiente

`db_supabase.py:441-451` — busca dados (`select('id', count='exact')`) só pra contar. Adicionar `count_only=True` que use `head=True`:
```python
result = self._table().select('id', count='exact', head=True).execute()
return result.count or 0
```
Não traz dados, só o header `Content-Range`.

### 2.6 Funções SQL para operações compostas

Para gamificação e relatórios pesados, criar `RPC functions` no Postgres (Supabase oferece via `client.rpc`). Move trabalho do Python para o banco, que tem dados localmente.

Exemplos:
```sql
-- Leaderboard sem trazer todas as transações para o Python
CREATE FUNCTION leaderboard_period(p_start timestamptz, p_limit int)
RETURNS TABLE (user_id uuid, coins_earned bigint) AS $$
  SELECT user_id, SUM(amount)::bigint
  FROM coin_transactions
  WHERE amount > 0 AND created_at >= p_start
  GROUP BY user_id
  ORDER BY 2 DESC LIMIT p_limit;
$$ LANGUAGE sql STABLE;
```
`get_leaderboard` em `gamification.py:723-777` deixa de carregar todas as transações para o Python.

---

## 3. Frontend (React + CRA)

### 3.1 Confirmar que `visual-edits` está OFF em produção (impacto ALTO se ON)

`craco.config.js:8,16-19,94-98` — o plugin Babel só roda quando `REACT_APP_ENABLE_VISUAL_EDITS=true`. Verificar em Vercel:

```bash
vercel env ls
# REACT_APP_ENABLE_VISUAL_EDITS NÃO deve aparecer ou estar setado como "false"
```

Se estiver ON em produção:
- Cada componente React vira `<div style={display:contents}><Componente x-file-name="..." x-id="..." x-line-number="..." x-component="..." x-dynamic="false">...</div>`. **Dobra o número de elementos no DOM.**
- O plugin parseia ASTs de arquivos importados a cada compilação para detectar "portais Radix". Em build de produção isso é overhead direto sem benefício.
- ~1100 linhas de plugin Babel rodando em build inflam tempo de build em ~30s e bundle por causa dos atributos extras.

Se essa variável estiver `true` em produção, **desativar imediatamente** é o quick win mais barato do guia.

### 3.2 Trocar cache caseiro por React Query / SWR (impacto ALTO)

`utils/api.js:6-32` — cache `Map` com TTL fixo de 30s, sem stale-while-revalidate, sem dedupe, sem invalidação por mutação automática. Resultado:

- Vários componentes que usam `api.getJobs()` simultaneamente disparam queries duplicadas (depende do timing — só 1 cache em window de 30s).
- Mutações chamam `clearCache('users')` manual, fácil esquecer.
- Sem refetch em foco da janela / reconexão.
- Sem indicação de loading separado de dado em cache.

**Migrar para React Query (TanStack Query):**
```jsx
// query
const { data: jobs, isLoading } = useQuery({
  queryKey: ['jobs', { days }],
  queryFn: () => api.getJobs({ days }).then(r => r.data),
  staleTime: 30_000,            // já cacheia 30s
  gcTime: 5 * 60_000,           // mantém em cache 5min
  refetchOnWindowFocus: true,   // refetch ao voltar pra aba
});

// mutação com invalidação automática
const queryClient = useQueryClient();
const updateJob = useMutation({
  mutationFn: ({ jobId, data }) => api.updateJob(jobId, data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
});
```

Ganhos:
- Dedupe entre componentes (1 request mesmo com 5 componentes pedindo).
- Stale-while-revalidate (mostra cache instantâneo + refetch em background).
- Erros e retries gerenciados.
- DevTools poderosa para debug.

### 3.3 Bundle splitting + dynamic imports

`App.js` já usa `lazy` para páginas (✅). Mas:

- **`recharts`/`Chart.js`** (se usado em `FamilyKPIsReport`, `GamificationReport`, `UnifiedReports`) é caro (~300KB). Confirmar que está só em páginas que usam.
- **`react-day-picker` + `date-fns`** carregados em todas as páginas via `useJobFilters`. Avaliar `import { subDays }` direto vs. `import * as dateFns`.
- **`lucide-react`** importa cada ícone individualmente (já é tree-shakable). OK.
- **Componentes shadcn/ui** todos importados explicitamente. OK.

Análise de bundle:
```bash
npm install --save-dev source-map-explorer
craco build
npx source-map-explorer build/static/js/main.*.js
```
Identifica os heavy hitters. Targets razoáveis: main bundle < 200KB gzip, vendor < 300KB gzip.

### 3.4 `useJobFilters` — `stats` percorre `jobs` 5 vezes

`hooks/useJobFilters.js:175-185`:
```js
const stats = useMemo(() => ({
  total: jobs.length,
  filtered: filteredJobs.length,
  byStatus: {
    aguardando: jobs.filter(j => j.status === 'aguardando').length,
    agendado:   jobs.filter(j => j.status === 'agendado').length,
    instalando: jobs.filter(j => j.status === 'instalando' || j.status === 'in_progress').length,
    finalizado: jobs.filter(j => j.status === 'finalizado' || j.status === 'completed').length,
    arquivado:  jobs.filter(j => j.archived || j.status === 'arquivado').length
  }
}), [jobs, filteredJobs]);
```
Para 1000 jobs, 5000 iterações. Substituir por um único `reduce`:

```js
const stats = useMemo(() => {
  const byStatus = { aguardando: 0, agendado: 0, instalando: 0, finalizado: 0, arquivado: 0 };
  for (const j of jobs) {
    if (j.archived || j.status === 'arquivado') byStatus.arquivado++;
    else if (j.status === 'instalando' || j.status === 'in_progress') byStatus.instalando++;
    else if (j.status === 'agendado' || j.status === 'scheduled') byStatus.agendado++;
    else if (j.status === 'finalizado' || j.status === 'completed') byStatus.finalizado++;
    else if (j.status === 'aguardando') byStatus.aguardando++;
  }
  return { total: jobs.length, filtered: filteredJobs.length, byStatus };
}, [jobs, filteredJobs]);
```
1000 iterações em vez de 5000. Importante quando o componente re-renderiza ao digitar no campo de busca.

### 3.5 Polling pesado em `SchedulerAdmin`

`pages/SchedulerAdmin.jsx:47` — `setInterval(fetchData, 30000)` enquanto a página estiver aberta. Se o admin esquecer a aba aberta a noite inteira, são 1.200 requests inúteis/dia.

**Mitigação:**
- Pausar quando a aba não está visível: `document.visibilityState === 'hidden'` → não chama.
- Usar React Query com `refetchInterval` que respeita `refetchIntervalInBackground: false` por padrão.

### 3.6 Imagens base64 fluindo pelo state React

Quando o instalador captura foto e envia, `photo_base64` (300KB string) entra em `useState`, e qualquer re-render copia/recopia. Para perf:

- Manter foto em `useRef` em vez de state (não causa re-render quando troca).
- Comprimir antes de armazenar no state (já é feito em alguns pontos).
- Liberar (`setPhoto(null)`) imediatamente após upload.

### 3.7 Service Worker quebrado (referência cruzada)

Já documentado em `AUDITORIA_CODIGO.md` item 3.1. Performance impact: sem SW funcional, app **não cacheia** assets nem responses → toda navegação pesa cold network. Quando consertar (ou substituir), considerar usar Workbox para:
- Cache-first nas chunks JS.
- Stale-while-revalidate em GETs da API.
- Background sync para checkin/checkout offline.

### 3.8 Preload das próximas páginas prováveis

Após login, é quase certo que o usuário vá para `/dashboard` (ou `/installer/dashboard`). Adicionar:
```jsx
// no Login.jsx, após login bem-sucedido
import('../pages/Dashboard'); // ou InstallerDashboard
```
Inicia o download do bundle enquanto o backend responde o login. Economiza 200-500ms na primeira navegação.

### 3.9 Eliminar `setTimeout` mágico em `useJobs`

`hooks/useJobs.js:58` — após sync, `setTimeout(fetchJobs, 2000)`. Deveria usar o retorno do POST `/sync-holdprint` (que devolve summary) e refetch só se imported > 0. Atualmente refetcha sempre, mesmo quando o sync não trouxe nada.

---

## 4. Build & Deploy

### 4.1 Cold start Vercel Python

Com lazy imports (1.10) e bundle leve, cold start cai de ~3s para ~1s. Outras táticas:

- Configurar `maxDuration` adequado em `vercel.json` (`"maxDuration": 30` para endpoints que precisam).
- Usar **Vercel Cron** para "warming" — ping `/health` a cada 5 min em horário comercial mantém função quente.
- Considerar deployment em **Vercel Edge** para rotas leves (não suporta Python ainda; alternativa é portar `/auth/me` para função Edge em TS).

### 4.2 Caching headers nas respostas

API hoje não envia `Cache-Control`. Endpoints que poderiam:

| Endpoint | Cache sugerido |
|---|---|
| `/api/notifications/vapid-public-key` | `public, max-age=86400` (chave estável) |
| `/api/product-families` | `private, max-age=300, stale-while-revalidate=600` |
| `/api/installers` | `private, max-age=60` |
| `/api/jobs/{id}` | `private, max-age=10, stale-while-revalidate=30` |

```python
@router.get("/product-families")
async def get_product_families(response: Response, ...):
    response.headers["Cache-Control"] = "private, max-age=300"
```

### 4.3 Pipeline de build

`craco.config.js:71-86` — `drop_console: true` ativado em produção (✅). Considere também:
```js
new TerserPlugin({
  terserOptions: {
    compress: { drop_console: true, drop_debugger: true, pure_funcs: ['console.info'] },
    format: { comments: false },
  },
  extractComments: false,
})
```

### 4.4 Compressão de assets

`vercel.json` (frontend) não declara `headers`. Vercel já faz Brotli por default, mas confirme com `curl -H "Accept-Encoding: br" -I https://app.com/...js` que retorna `Content-Encoding: br`.

---

## 5. Monitoramento (essencial para perf real)

Sem medir, qualquer otimização é palpite. Adicionar:

- **Vercel Analytics** (built-in para CRA via `@vercel/analytics`): Web Vitals (LCP, CLS, INP) por página.
- **Vercel Speed Insights** ou **Sentry Performance**: traces de transações, SQL lentas.
- **Logs estruturados no backend**:
  ```python
  logger.info("query_completed", extra={"endpoint": "/jobs", "duration_ms": 234, "rows": 47})
  ```
- **Supabase Dashboard → Database → Query Performance**: top queries lentas. Se aparecer um `SELECT * FROM jobs WHERE archived <> true` consumindo CPU, aplicar índice 2.1.
- **PostHog** (já instalado em `index.html:166`): instrumentar eventos de UX (`time_to_jobs_loaded`, `checkin_to_response_ms`).

---

## 6. Roadmap priorizado

### Sprint 1 (1 semana — quick wins, baixo risco)
1. Confirmar/desativar `REACT_APP_ENABLE_VISUAL_EDITS` em produção (5 min).
2. Adicionar índices compostos e parciais (item 2.1, 2.2) — `CONCURRENTLY` no Supabase, sem downtime.
3. Lazy imports de `openpyxl`/`PIL`/`googleapiclient` em rotas (item 1.10).
4. Ativar Supabase Pooler (porta 6543) em `SUPABASE_URL`.
5. Cache de 60s para `get_current_user` (item 1.6).
6. Eliminar N+1 das rotas mais quentes (item 1.1) — começar por `get_all_redemptions`, `get_leaderboard`, `/location-alerts`.
7. Compressão no frontend antes do upload (item 1.3 alternativa).

### Sprint 2 (2 semanas — wins médios)
8. Função SQL `increment_coins` + refatorar `award_coins` (item 1.5).
9. Implementar `find_one_and_update` em uma chamada (item 1.4).
10. Migrar fetches do frontend para React Query (item 3.2).
11. `count_documents` com `head=True` (item 2.5).
12. Holdprint sync paralelo (item 1.7).
13. Funções RPC do Supabase para leaderboard e relatórios (item 2.6).
14. Headers de cache na API (item 4.2).

### Sprint 3 (2-4 semanas — mudanças estruturais)
15. **Migrar fotos para Supabase Storage** (item 1.2). Maior impacto, requer migração de dados.
16. Repensar export Excel — async job + status polling (item 1.8).
17. Service Worker com Workbox + offline para checkin (item 3.7).
18. Paginação real em `/jobs`, `/checkins`, `/transactions`, etc.
19. Stripping/arquivamento de `holdprint_data` antigo (item 2.3).

### Contínuo
20. Setup de monitoramento e métricas (seção 5).
21. Análise de bundle quinzenal.
22. Limpar dead code (services/holdprint.py duplicado, run_migration_supabase.py vazio).

---

## Anexo: ganhos estimados por ação

| Ação | LCP / TTFB | DB load | Bandwidth | Memória |
|---|---|---|---|---|
| Fotos no Storage | -300ms (lista) | -80% | -90% | -70% |
| React Query | -200-500ms percebido | -30% (dedupe) | -50% | neutro |
| Índices parciais | -50-300ms por query | -60% CPU | neutro | neutro |
| Eliminar N+1 | -200-1000ms (relatórios) | -90% queries | -10% | neutro |
| Lazy imports backend | -800ms cold start | neutro | neutro | -20% |
| Pooler Supabase | -100-200ms | -50% conexões | neutro | neutro |
| Babel plugin OFF | -1s build, -5-10% bundle | neutro | -10% | -20% DOM |
| Compressão no frontend | neutro | neutro | -50% upload | -CPU servidor |

Os números são aditivos parcialmente — combinados, espera-se ver tempos de carregamento das telas administrativas caírem de ~3-5s para sub-segundo, e checkout do instalador (que envia foto) de ~2s para ~500ms.
