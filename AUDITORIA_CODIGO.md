# Auditoria de Código — Indústria Visual (Supabase + FastAPI + React)

Data: 2026-04-29
Escopo: backend Python (FastAPI + Supabase), frontend React (PWA), migrations SQL, scripts auxiliares e configurações de deploy.

Severidades: **CRÍTICO · ALTO · MÉDIO · BAIXO**.

---

## 1. Resumo Executivo

O sistema funciona razoavelmente bem em fluxos básicos, mas apresenta **dois vazamentos de credenciais críticos**, um Service Worker quebrado em produção, divergências significativas entre o schema PostgreSQL e o "schema" replicado em Python (`TABLE_COLUMNS`), além de duplicação massiva de lógica entre `routes/jobs.py`, `services/holdprint.py`, `services/sync_holdprint.py` e `services/scheduler.py` — com **três implementações diferentes** da mesma função `extract_product_dimensions`, cada uma assumindo unidades distintas para largura/altura (m, cm, mm). Isso compromete a integridade dos dados de produtividade e área (`m²`).

São listados **38 achados**, sendo 2 críticos, 11 altos, 14 médios e 11 baixos.

---

## 2. CRÍTICOS

### 2.1 [CRÍTICO] Service key do Supabase commitada como fallback (acesso total ao banco)
**Arquivo:** `backend/migrations/migrate_to_supabase.py:21`
```python
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '<REDACTED — chave rotacionada>')
# ⚠ A chave real foi removida deste arquivo. Rotacionar no Supabase Dashboard.
```
Mesma chave também aparece literal em `DEPLOY_VERCEL_COMPLETO.md:53`. A `service_role` key **bypassa Row-Level Security** — qualquer pessoa com acesso ao repositório pode ler, alterar ou deletar todas as tabelas. Bonus problema na mesma linha 20: a URL hardcoded `https://otyrrkvixegiqsthmaaj.supabase.co` tem **typo** (`rrkv`) em relação à URL usada por `db_supabase.py:26` (`otyrrvkixegiqsthmaaj`, com `rrvk`) — ou seja, o script de migração aponta para um projeto diferente do app.

**Ação imediata:**
1. Rotacionar a service key no painel Supabase (a antiga deve ser considerada comprometida).
2. Remover o fallback — falhar com `RuntimeError` se a env var não existir, igual ao padrão correto de `config.py:13-15`.
3. Reescrever o histórico do git (`git filter-repo`) ou aceitar a chave como vazada e revogá-la.
4. Mover toda referência a `sb_secret_*` da documentação Markdown para um cofre/Vercel Env vars.

---

### 2.2 [CRÍTICO] Senha de admin em texto claro no código e documentação
**Arquivos:**
- `backend/init_admin.py:18,33,42` — `mktindustriavisual@gmail.com` / `@Industria123456`
- `DOCUMENTACAO_SISTEMA.md:204-205`, `DOCUMENTACAO_SISTEMA.html:498-499`
- `test_reports/iteration_5.json:31`
- Todo o diretório `.history/` (Local History do VS Code) também inclui essas credenciais.

**Ação imediata:**
1. Trocar a senha do admin em produção AGORA.
2. Remover `init_admin.py` do repo ou trocar para receber senha via prompt/env var.
3. Adicionar `.history/` ao `.gitignore` e removê-lo do tracking (`git rm -r --cached .history`).
4. `test_reports/` também deve sair do repo.

---

## 3. ALTOS

### 3.1 [ALTO] Service Worker registrado com nome que não existe (PWA quebrada)
- `frontend/public/index.html:37` e `frontend/src/hooks/usePushNotifications.js:43` registram `/service-worker.js`.
- O arquivo no disco é `frontend/public/sw.js`.

Resultado: SW não registra → push notifications, cache offline e atualização via `UpdateNotification.jsx` não funcionam em produção. Corrigir para `/sw.js` em ambos os locais ou renomear o arquivo para `service-worker.js`.

### 3.2 [ALTO] Três implementações divergentes de `extract_product_dimensions`
| Arquivo | Suposição de unidade |
|---|---|
| `services/holdprint.py:56-180` | "se valor < 100, está em metros, senão em cm e divide por 100" (heurística) |
| `services/sync_holdprint.py:18-43` | "valor está em **mm**, divide por 1000" (sempre) |
| `services/scheduler.py:35` | importa de `services/holdprint.py` (heurístico) |

A função usada pelo cron Vercel (`server.py:159 → sync_holdprint_jobs_sync`) é a versão **mm**. As importações manuais via UI usam a versão **heurística** (`routes/jobs.py:25 → from services.holdprint import extract_product_dimensions`). Para o mesmo job da Holdprint, o `area_m2` armazenado pode ser **1000× maior** ou **100× menor** dependendo de qual caminho importou. Isso destrói qualquer relatório de produtividade m²/h.

**Ação:** consolidar em uma única função, decidir a unidade de origem da Holdprint (verificar empiricamente), e apagar as duplicatas. Migrar dados existentes corrigindo `area_m2` retroativamente.

### 3.3 [ALTO] Schema SQL desincronizado com `TABLE_COLUMNS` em `db_supabase.py`
Comparando `migrations/supabase_schema.sql` com `backend/db_supabase.py:52-137`:

| Tabela | SQL tem | Código `TABLE_COLUMNS` espera |
|---|---|---|
| `jobs` | `is_archived`, `scheduled_time`, `job_number` | `archived`, `archived_at`, `archived_by`, `archived_by_name`, `no_installation`, `notes`, `cancelled_at`, `justification`, `justified_at`, `installation_config`, `completed_at` |
| `item_checkins` | `time_worked_minutes`, `pause_time_minutes`, `coins_earned`, `total_area_m2`, `checkout_lat`, `checkout_long`, `products_installed` | `duration_minutes`, `net_duration_minutes`, `total_pause_minutes`, `gps_accuracy`, `checkout_gps_lat`, `checkout_gps_long`, `installed_m2`, `complexity_level`, `height_category`, `scenario_category`, `notes`, `productivity_m2_h`, `is_archived`, `product_name`, `family_name` |
| `item_pause_logs` | `start_time`, `end_time`, `item_checkin_id` | `paused_at`, `resumed_at`, `checkin_id` |
| `checkins` (legacy) | `checkin_time`, `checkout_time` | `checkin_at`, `checkout_at` |

`_filter_columns()` em `db_supabase.py:143-151` descarta silenciosamente todas as colunas que estão em `TABLE_COLUMNS` mas não no banco — então **dados são perdidos sem erro**: pause logs, checkins, jobs estão sendo gravados sem campos importantes. Provavelmente o banco real tem ALTER TABLEs aplicados que não estão no SQL versionado. Reconciliar o schema versionado com o estado real do Supabase.

### 3.4 [ALTO] `/metrics` retorna sempre `avg_duration_minutes: 0`
**Arquivo:** `backend/routes/reports.py:798-810`
```python
item_checkins = db.item_checkins.find({}, {"_id": 0, "status": 1, "time_worked_minutes": 1})
...
completed_with_time = [c for c in item_checkins if c.get("status") == "completed" and c.get("time_worked_minutes")]
```
A coluna `time_worked_minutes` não existe no `TABLE_COLUMNS`. Mesmo que existisse no banco (item 3.3), nenhum INSERT/UPDATE em `routes/item_checkins.py` grava esse campo — o código usa `duration_minutes` / `net_duration_minutes`. Resultado: dashboard administrativo mostra 0 min de duração média. Corrigir para `net_duration_minutes`.

### 3.5 [ALTO] `result.deleted_count` e `result.modified_count` em retorno que é `dict`
`db_supabase.py` retorna **dicts** de `delete_one` (`{'deleted_count': N}`) e `update_one`, mas o código consome com acesso por atributo:

| Local | Bug |
|---|---|
| `routes/users.py:71` | `if result.deleted_count == 0:` → `AttributeError` em runtime |
| `routes/products.py:183` | `if result.modified_count == 0:` |
| `routes/products.py:196` | `if result.deleted_count == 0:` |

A rota `DELETE /users/{user_id}` lança 500 toda vez que é chamada. Pegou o estilo do PyMongo no migrate, mas o wrapper Supabase não retorna objetos. Corrigir todos os pontos para `result.get('deleted_count', 0)`.

### 3.6 [ALTO] CORS por padrão `*` com credentials habilitadas
**Arquivo:** `backend/server.py:215-221`
```python
allow_credentials=True,
allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
allow_methods=["*"],
allow_headers=["*"],
```
Se `CORS_ORIGINS` não estiver setado em produção, o app aceita credenciais de qualquer origem. Os browsers modernos rejeitam essa combinação, mas APIs server-to-server e configurações inadvertidas podem expor a API. Definir `CORS_ORIGINS` explicitamente em todos os ambientes e garantir que `*` nunca seja o valor efetivo quando `allow_credentials=True`.

### 3.7 [ALTO] `unarchive-items` recebe `List[int]` sem `Body(...)` → FastAPI espera query string
**Arquivo:** `backend/routes/jobs.py:1015-1037`
```python
async def unarchive_job_items(job_id: str, item_indices: List[int], current_user: ...):
```
FastAPI trata tipos primitivos sem `Body(...)` como query parameters. O frontend (`frontend/src/utils/api.js:118`) envia o array no body — o endpoint sempre retornará 422. Encapsular em um `Pydantic` model (já existe `ArchiveItemsRequest` para a outra rota) ou usar `Body(...)`.

### 3.8 [ALTO] Filtros `$regex` em datas geram `ilike '%^YYYY-MM-DD%'` (incorreto)
**Arquivos:** `backend/routes/notifications.py:193,226`
`db_supabase.py:189-190` mapeia `$regex` para `ilike '%pattern%'`. PostgreSQL `ilike` não interpreta `^` como âncora — o caractere `^` literal é procurado dentro da string. Resultado: `check_schedule_conflicts` e `pending_checkins` nunca encontram nada. Trocar por filtros de range com `$gte`/`$lt` em ISO strings.

### 3.9 [ALTO] OAuth Google com `state = user_id` sem CSRF/HMAC
**Arquivo:** `backend/routes/calendar.py:93,144-145`
```python
state = f"{current_user.id}"
...
user = db.users.find_one({"id": state}, {"_id": 0})
```
Atacante pode forjar o callback do Google com um `state` arbitrário e linkar uma conta Google a qualquer `user_id`. Pelo menos assinar `state` com HMAC e validar no callback; idealmente usar a biblioteca oficial `google-auth-oauthlib` que já trata o `state` com CSRF token.

### 3.10 [ALTO] `services/holdprint.py:fetch_holdprint_jobs` ignora período e busca SEMPRE 01-07/Jan/2026
```python
start_date_str = "2026-01-01"
end_date_str = "2026-01-07"
```
A função recebe `branch` mas nem aceita `month/year`. Aparentemente é dead code (ninguém importa essa função; `routes/jobs.py` define a sua própria), mas continua importável e pronta para causar bug se alguém usar. Apagar ou consolidar.

### 3.11 [ALTO] Race conditions em saldo de moedas / lifetime_coins
**Arquivos:** `backend/routes/gamification.py:174-217`, `backend/services/gamification.py:45-103`, `backend/db_supabase.py:357-373`
Padrão read-modify-write sem locking nem `UPDATE table SET col = col + N`. Dois `process_checkout` simultâneos podem sobrescrever um ao outro e creditar moedas em duplicidade ou perder créditos. O bloco `$inc` em `db_supabase.py:357-361` também é read-modify-write — não é uma operação atômica do Postgres como no MongoDB. Para campos numéricos, executar `UPDATE ... SET col = col + N` via `rpc` ou função Postgres.

---

## 4. MÉDIOS

### 4.1 [MÉDIO] URL e ANON key do Supabase com fallback hardcoded
`backend/db_supabase.py:26-27` — fallback `https://otyrrvkixegiqsthmaaj.supabase.co` exposto. URL pública isolada não é "credencial" no mesmo nível da service key, mas combinada à anon key (também acessível via fallback) facilita reconnaissance. Remover defaults.

### 4.2 [MÉDIO] JWT secret derivado da service key
`config.py:13-16` — `SECRET_KEY = sha256(SUPABASE_SERVICE_KEY)`. Quando a service key é rotacionada (deve ser, especialmente após o vazamento item 2.1), TODOS os tokens JWT existentes invalidam. Pior: se houver outro componente que também derive um secret da service key, eles ficam acoplados. Criar `JWT_SECRET` separado.

### 4.3 [MÉDIO] Política de senha fraca (mínimo 6 caracteres, sem complexidade)
`auth_new.py:143,239,463,517,578` — todos checam apenas `len(password) < 6`. Aumentar para 10+, exigir complexidade ou integrar `zxcvbn`. Considerar política unificada (atualmente repetida 5×).

### 4.4 [MÉDIO] Registro público aberto sem rate limiting / captcha
`auth_new.py:130 POST /auth/register` cria conta de instalador para qualquer email. Sem CAPTCHA, sem rate limit, sem confirmação de email. Atacante pode encher o banco. Adicionar rate limiting (slowapi/redis) e verificação de email.

### 4.5 [MÉDIO] Massive duplication: 4 funções de "import jobs" praticamente iguais
`routes/jobs.py:1245-1690` contém 4 funções (`import_all`, `import_current_month`, `import_month`, `sync_holdprint_jobs`) com blocos de ~80 linhas idênticos para criar `Job` a partir do payload Holdprint. Refatorar em uma função única — qualquer correção precisa ser aplicada 4 vezes hoje.

### 4.6 [MÉDIO] `datetime.utcnow()` deprecated (Python 3.12+)
`routes/jobs.py:306,320` — usa `datetime.utcnow()` que está deprecated. O resto do codebase já usa `datetime.now(timezone.utc)`. Converter para padronizar e silenciar warnings.

### 4.7 [MÉDIO] `jobs.py:1571-1575` — cálculo de "meses anteriores" usa `i*30 dias`
```python
target_date = now - timedelta(days=i * 30)
```
Pode pular um mês ou repetir o mesmo mês quando atravessa fevereiro. Usar `dateutil.relativedelta(months=i)`.

### 4.8 [MÉDIO] `request_form` `notes: str = Form("")` em `checkout` mas espera `Optional[str]`
`routes/checkins.py:327` — `notes: str = Form("")` é aceito pelo backend, mas o tipo está implícito como `str` (não Optional). Inconsistente com `routes/item_checkins.py:397` (que usa `Optional[str] = Form(None)`). OK funcional, mas alinhe.

### 4.9 [MÉDIO] `count_documents` ineficiente
`db_supabase.py:444-451` — chama `select('id', count='exact')` e ainda traz dados (sem `head=True`). Para tabelas grandes, custo desnecessário. Adicionar `count='exact', head=True` ou usar a flag de cabeçalho do PostgREST.

### 4.10 [MÉDIO] PAUSE_REASONS divergem entre `config.py` e `routes/item_checkins.py`
`config.py:55-65`: `aguardando_cliente`, `chuva`, `falta_material`, `almoco_intervalo`, etc.
`routes/item_checkins.py:24-32`: `almoço`, `banheiro`, `esperando_material`, `problema_tecnico`, etc.
Listas completamente diferentes. Endpoint `/pause-reasons` retorna a versão de `item_checkins.py`, mas o front pode pegar a outra de algum endpoint. Consolidar em um lugar.

### 4.11 [MÉDIO] Sync com Holdprint não agrega push-back para usuário durante import
`routes/jobs.py:1556` (`sync-holdprint`) e `useJobs.js:51-67` — `setSyncing(false)` em `setTimeout(2000ms)` independente do tempo real do sync. Para syncs > 2s, UI engana o usuário. Use o retorno da API ao invés de timeout.

### 4.12 [MÉDIO] `find_one_and_update` usa update_one + find_one (não atômico)
`db_supabase.py:404-417` — duas operações separadas; entre elas outro processo pode atualizar. Em PostgREST, usar `RETURNING *` na atualização (já é suportado) e devolver da mesma chamada.

### 4.13 [MÉDIO] RLS desabilitado no schema versionado
`migrations/supabase_schema.sql:332-337` — comentários sugerem RLS é "opcional". Com a service key vazada (item 2.1), ela bypassa RLS de qualquer forma, mas se a `anon_key` for usada em algum ponto do frontend (já há fallback em `db_supabase.py:27`), todos os dados ficam abertos. Habilitar RLS por padrão e definir policies por role.

### 4.14 [MÉDIO] `update_many` chama `update_one` (silenciosamente equivalente, mas aplicado a todos)
`db_supabase.py:400-402` — comentário sugere "modify many" mas implementação atualiza tudo que casa via `eq()`. PostgREST aplica em todas as linhas que casam, então funciona. Mas a semântica é confusa e o `modified_count` retornado é o de uma única chamada — pode dar diferença em logs.

---

## 5. BAIXOS

### 5.1 [BAIXO] `.gitignore` corrompido com `-e` literais e duplicatas
Linhas 82-165 do `.gitignore` tem 8 cópias do bloco "Environment files" intercaladas por strings `-e ` (resíduo de `echo -e` no Windows). Funciona, mas o arquivo está poluído. Limpar.

### 5.2 [BAIXO] `README.md` raiz contém apenas "Here are your Instructions"
Sem onboarding, comandos de dev, prerequisites. `backend/README.md` está mais completo mas referencia `.env.example` que não existe.

### 5.3 [BAIXO] Dependência `PyJWT` instalada sem ser usada
`requirements.txt:13` — código usa `python-jose` (`from jose import jwt`). PyJWT é overhead.

### 5.4 [BAIXO] `from calendar import monthrange` não usado
`routes/jobs.py:14` — import morto.

### 5.5 [BAIXO] Comentário enganoso em `tokenManager.js`
`utils/tokenManager.js:90-98` — `migrateFromLocalStorage` faz "from localStorage to localStorage". Provavelmente migrava de chave antiga (`token`) para nova (`auth_token`) e o comentário virou erro de copy-paste.

### 5.6 [BAIXO] Inconsistência de ano em copyright
- `Login.jsx:118` → "© 2025"
- `auth_new.py:378` (email HTML) → "© 2026"
- Hoje (sistema) → 2026.

### 5.7 [BAIXO] Sanitização de token frontend (security theater)
`tokenManager.js:13` — `replace(/[<>'"&]/g, '')` em token JWT (que nunca contém esses chars em base64url). Não causa problema, mas dá falsa sensação de segurança. JWT corrompido pelo regex (jamais acontece) viraria 401 silenciosamente.

### 5.8 [BAIXO] PostHog API key em texto claro no `index.html`
`index.html:166` — `phc_yJW1VjHGGwmCbbrtczfqqNxgBDbhlhOWcdzcIJEOTFE`. PostHog client keys são públicas por design (intended for browser usage), então não é segredo. Mas convém validar que não é uma personal API key (que sim, seria sensível).

### 5.9 [BAIXO] Script externo `emergent-main.js`
`index.html:28` — carrega script de domínio terceiro. Provavelmente do scaffold tool. Avaliar se ainda é necessário em produção.

### 5.10 [BAIXO] Ausência total de testes automatizados
Sem `tests/`, sem `pytest`, sem `jest`/`vitest`. `.gitignore` chega a explicitar `*_test.py` para ignorar testes "em produção". Lacuna grande para um sistema com regras de negócio (gamificação, cálculo de produtividade, GPS validation).

### 5.11 [BAIXO] Cron Vercel `0 6 * * *` (diário) vs documentação que afirma `*/30 * * * *`
`backend/vercel.json:25` — schedule diário às 06:00 UTC. Mas `server.py:102` mostra `Vercel Cron (*/30 * * * *)` em mensagem. Alinhar.

---

## 6. SCRIPTS PRESENTES NO REPOSITÓRIO

Mapeamento e estado:

| Script | Localização | Estado |
|---|---|---|
| `backend/init_admin.py` | Cria admin com senha hardcoded | **REMOVER/REFATORAR (CRÍTICO 2.2)** |
| `backend/migrations/migrate_to_supabase.py` | Migração Mongo → Supabase, com service key hardcoded | **REMOVER/REFATORAR (CRÍTICO 2.1)** |
| `backend/migrations/run_migration_supabase.py` | **arquivo vazio (0 linhas)** — só ocupa espaço |
| `backend/migrations/supabase_schema.sql` | Schema "principal" — desincronizado com código (ALTO 3.3) |
| `backend/migrations/supabase_add_columns.sql` | Patch idempotente, OK, mas comentários sugerem droppar FKs "se necessário" (perigoso) |
| `backend/migrations/supabase_missing_tables.sql` | Recria `location_alerts` e `gamification_balances` — duplica o que já está no schema |
| `backend/services/scheduler.py` | APScheduler para sync diário Holdprint às 9 UTC. Não roda em serverless |
| `backend/services/sync_holdprint.py` | Versão "stateless" para Vercel cron |
| `backend/services/holdprint.py` | Versão antiga — `fetch_holdprint_jobs` com período hardcoded (ALTO 3.10) |
| `backend/api/index.py` | Entry point Vercel, OK |
| `backend/server.py` | App principal FastAPI, OK |
| `frontend/plugins/health-check/*.js` | Health endpoints **só para webpack-dev-server** — não roda em produção |
| `frontend/plugins/visual-edits/babel-metadata-plugin.js` | Plugin Babel que adiciona atributos `x-*` em todos os JSX (~1100 linhas, complexo). Adiciona overhead de build e runtime; útil só para o tooling do Emergent (assistente visual). Avaliar se é necessário em produção. |

---

## 7. Recomendações Prioritárias

### Imediato (hoje)
1. **Rotacionar service key Supabase** e a senha admin (críticos 2.1 e 2.2).
2. Remover `migrate_to_supabase.py` (ou pelo menos o fallback) e os arquivos de documentação que listam credenciais. Re-escrever histórico do git.
3. Adicionar `.history/`, `test_reports/` e qualquer artefato com credenciais ao `.gitignore` e remover do tracking.
4. Corrigir nome do Service Worker (`sw.js` ↔ `service-worker.js`) — uma linha em duas posições.

### Curto prazo (esta semana)
5. Reconciliar schema SQL × `TABLE_COLUMNS` × código de inserção/leitura (item 3.3) — provavelmente requer um SQL dump real do Supabase + scripts de migração.
6. Consolidar as 3 versões de `extract_product_dimensions` em uma única, validar contra payloads reais da Holdprint, e re-processar `area_m2` dos jobs já importados.
7. Corrigir `result.deleted_count`/`modified_count` (item 3.5) — quebra hard endpoints de delete.
8. Trocar `/metrics` para usar `net_duration_minutes` (item 3.4).
9. Definir `CORS_ORIGINS` em prod e nunca permitir `*` com credentials.
10. Encapsular `unarchive-items` em Pydantic model (item 3.7).
11. Trocar filtro `$regex` em datas por `$gte`/`$lt` (item 3.8).

### Médio prazo
12. Política de senha forte + rate limit em `/auth/register` e `/auth/forgot-password`.
13. JWT secret independente da service key.
14. Refatorar duplicação dos 4 endpoints de import-jobs.
15. Habilitar RLS no Supabase com policies por role.
16. Tornar atualização de `coins` atômica via função SQL (`coins = coins + N`).
17. Setup de testes (pytest + react-testing-library) e CI básico no Vercel/GitHub.
18. CSRF/HMAC no `state` do OAuth Google.

---

## 8. Observações finais

- Há sinais claros de evolução iterativa (`auth_new.py`, `migrations/run_migration_supabase.py` vazio, três versões de extract_product_dimensions). O passo lógico é congelar o que está em produção, escrever um SQL dump verdadeiro do Supabase como nova baseline e depois aplicar as correções acima de forma rastreável.
- O frontend é razoavelmente limpo (lazy loading, componentes shadcn/ui, hooks isolados); a maior parte da dívida técnica está concentrada no backend e nas migrations.
- O sistema **funciona**, mas as duas falhas críticas (chave de service e senha admin no repo) precisam ser tratadas antes de qualquer outra coisa.
