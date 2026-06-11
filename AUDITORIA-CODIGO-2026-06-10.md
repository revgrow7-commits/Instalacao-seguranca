# Auditoria de Código Pré-Produção — instal-visual.com.br
**Data:** 2026-06-10  
**Auditor:** Claude Sonnet 4.6 (subagente)  
**Base:** `/sessions/beautiful-peaceful-clarke/mnt/supabase/` (C:\Users\andre\Downloads\claude\Instal-supa\supabase)

---

## Resumo Executivo

| Severidade | Quantidade |
|---|---|
| 🔴 Bloqueador | 3 |
| 🟡 Deve corrigir | 8 |
| 🟢 Melhoria | 6 |

Stack: React 18 (CRA, JS puro), FastAPI Python, Supabase PostgreSQL.  
Ponto de entrada frontend: `frontend/src/index.js` → `App.js` → `AuthProvider` + `AppRoutes`.  
Ponto de entrada backend: `backend/server.py` (FastAPI, serverless Vercel).

---

## FASE 0 — Pontos de Entrada Identificados

- **Frontend:** `frontend/src/index.js` → `App.js` (ErrorBoundary + BrowserRouter + AuthProvider)
- **Backend:** `backend/server.py` inclui 15 módulos de rota em `api_router` (prefix `/api`)
- **Auth:** `context/AuthContext.jsx` + `utils/tokenManager.js` (localStorage)
- **API layer:** `utils/api.js` (axios + retry + SWR cache)
- **Banco:** `backend/db_supabase.py` (wrapper MongoDB-like sobre Supabase PostgREST)

---

## Categoria 1 — Tratamento de Erros e Resiliência

### 🔴 BLOQ-01 — Loading infinito em `Users.jsx` quando `isAdmin` é false

**Arquivo:** `frontend/src/pages/Users.jsx` linhas 35-55

**Problema:** `loadData()` só é chamado se `isAdmin` for true (linha 36-38). Quando um `manager` ou qualquer outra role acessa `/users`, o `setLoading(false)` **nunca é chamado** porque `loadData()` não executa. O `loading` inicial é `true` e fica travado.

**Código atual:**
```js
const [loading, setLoading] = useState(true);

useEffect(() => {
  if (isAdmin) {
    loadData();  // só entra aqui se admin
  }
  // Se não entrar, loading permanece true para sempre
}, [isAdmin]);
```

**Por que impacta:** Manager que navega para `/users` vê spinner infinito. Bloqueador de UX.

**Correção:**
```js
useEffect(() => {
  if (isAdmin) {
    loadData();
  } else {
    setLoading(false); // garantir reset de loading
  }
}, [isAdmin]);
```

---

### 🔴 BLOQ-02 — `setInstaller.data` sem fallback em `Checkins.jsx` — crash em rede lenta

**Arquivo:** `frontend/src/pages/Checkins.jsx` linha 338

**Problema:** `setInstallers(installersRes.data)` não tem fallback `|| []`. Se `installersRes.data` for `undefined` (race condition, rede lenta, cache stale), `.find()` ou `.map()` chamado depois sobre `installers` lança `TypeError`.

**Código atual:**
```js
setInstallers(installersRes.data);  // pode ser undefined
```

**Correção:**
```js
setInstallers(installersRes.data || []);
```

---

### 🔴 BLOQ-03 — Tokens JWT em `localStorage` expostos a XSS (risco de segurança reconhecido)

**Arquivo:** `frontend/src/utils/tokenManager.js` linhas 6, 34-37

**Problema:** JWT é armazenado em `localStorage`. Qualquer script injetado (XSS em dependência de terceiro, CDN comprometido) consegue `localStorage.getItem('auth_token')` e impersonar o usuário com role `admin`. O projeto usa CRA com muitas dependências npm (framer-motion, radix-ui, etc.), ampliando a superfície.

**Por que impacta:** Comprometimento total de sessões admin se XSS ocorrer. Risco elevado em apps com foto-upload (base64 vinda do device) e links externos (WhatsApp, Google Calendar).

**Correção sugerida:** Migrar para `httpOnly cookie` (requer endpoint `/api/auth/refresh` no backend). Curto prazo: adicionar CSP `script-src 'self'` estrito na Vercel para bloquear execução de scripts não-origin.

**Nota:** Este risco já estava documentado em `ARCH-004`/`PENDING`. Registrado aqui como bloqueador por ser crítico para dados de campo (GPS, fotos, roles admin).

---

### 🟡 CORR-01 — `catch(() => {})` silencioso em `InstallerJobDetail.jsx` — erros de VC invisíveis

**Arquivo:** `frontend/src/pages/InstallerJobDetail.jsx` linha 171

**Problema:** A chamada de busca do papel no Visual Connect termina em `.catch(() => {})`. Se o endpoint falhar por erro de autenticação (key errada), o instalador nunca sabe que o papel não foi carregado — e parte do UI pode ficar inconsistente.

**Código atual:**
```js
.catch(() => {});
```

**Correção:** Já é fire-and-forget por design, mas logar:
```js
.catch(err => console.warn('[InstallerJobDetail] VC papel:', err?.message));
```

---

### 🟡 CORR-02 — `useApiCall.js` faz `refresh().catch(() => {})` — oculta erros de inicialização

**Arquivo:** `frontend/src/hooks/useApiCall.js` linha 113

**Problema:** O useEffect dispara `refresh().catch(() => {})`. Quando o hook `errorMessage` não está configurado pelo caller, erros de rede ficam completamente invisíveis — sem toast, sem log. Hooks como `useVisitas` e `useJobs` dependem disso.

**Código atual:**
```js
refresh().catch(() => {});
```

**Correção:** Adicionar log mínimo:
```js
refresh().catch(err => {
  if (!errorMessageRef.current) {
    console.warn('[useApiCall] auto-fetch failed silently:', err?.message);
  }
});
```

---

### 🟡 CORR-03 — `Jobs.jsx` `loadInstallers` sem feedback de erro e sem setLoading

**Arquivo:** `frontend/src/pages/Jobs.jsx` linhas 575-582

**Problema:** `loadInstallers` tem catch com apenas `console.error` e nenhum `toast`. O usuário não sabe que a lista de instaladores falhou. Como essa função não tem `setLoading`, não há risco de loading infinito, mas a UX falha silenciosamente — selects de atribuição ficam vazios sem explicação.

**Código atual:**
```js
} catch (error) {
  console.error('Error loading installers:', error);
}
```

**Correção:**
```js
} catch (error) {
  console.error('Error loading installers:', error);
  toast.error('Não foi possível carregar a lista de instaladores');
}
```

---

### 🟡 CORR-04 — `reset_password` no backend não captura `HTTPException` no bloco de expiração

**Arquivo:** `backend/routes/auth_new.py` linhas 498-511

**Problema:** O bloco `try/except ValueError` ao parsear `expires_at` captura apenas `ValueError`, mas o `raise HTTPException` para token expirado é lançado **dentro do try**, antes do except. Se o parse falhar com outro erro, o token expirado não é deletado e o fluxo continua sem erro para o caller.

**Código atual:**
```python
try:
    expires_at = datetime.fromisoformat(...)
    if datetime.now(timezone.utc) > expires_at:
        db.password_resets.delete_one({"token": request.token})
        raise HTTPException(...)  # lançado dentro do try
except ValueError as e:           # não captura HTTPException
    logger.error(...)
```

**Por que impacta:** Token com `expires_at` malformado deixa o reset prosseguir sem validação de expiração.

**Correção:** Separar validação do raise:
```python
try:
    expires_at = datetime.fromisoformat(...)
except ValueError as e:
    logger.error(f"Error parsing expiry date: {e}")
    expires_at = None

if expires_at and datetime.now(timezone.utc) > expires_at:
    db.password_resets.delete_one({"token": request.token})
    raise HTTPException(status_code=400, detail="Token expirado.")
```

---

### 🟡 CORR-05 — `_installer_name_cache` global em `visitas.py` — estado compartilhado entre invocações serverless

**Arquivo:** `backend/routes/visitas.py` linhas 59-69

**Problema:** `_installer_name_cache` é um dict em memória no nível de módulo. Em serverless (Vercel), cada cold start tem memória fresh — mas instâncias warm reutilizam o cache **sem TTL**. Se um instalador mudar de nome, o cache fica com o valor antigo indefinidamente (até a próxima cold start). O enriquecimento em `item_checkins.py` tem o mesmo padrão, mas tem TTL de 300s.

**Correção:** Adicionar TTL ao cache:
```python
_installer_name_cache: dict = {}
_installer_name_cache_ts: dict = {}
_INSTALLER_CACHE_TTL = 300  # 5 min

def _enrich_installer_name(doc: dict) -> dict:
    installer_id = doc.get("installer_id")
    if not installer_id:
        return doc
    now = time.time()
    if installer_id not in _installer_name_cache or now - _installer_name_cache_ts.get(installer_id, 0) > _INSTALLER_CACHE_TTL:
        rec = db.installers.find_one({"id": installer_id})
        _installer_name_cache[installer_id] = rec.get("full_name", "") if rec else ""
        _installer_name_cache_ts[installer_id] = now
    doc["installer_name"] = _installer_name_cache[installer_id]
    return doc
```

---

### 🟡 CORR-06 — Backend: `update_user` em `users.py` exclui `phone` e `branch` do `update_data`

**Arquivo:** `backend/routes/users.py` linha 44

**Problema:** A linha de filtragem exclui `phone` e `branch` dos campos atualizáveis via `PUT /users/:id`:
```python
update_data = {k: v for k, v in user_data.items() if k not in ['id', 'created_at', 'password', 'phone', 'branch']}
```
Mas logo abaixo (linhas 59-71), a lógica de `installer_update` **usa** `user_data.get('phone')` e `user_data.get('branch')` para atualizar a tabela `installers`. Isso cria um comportamento inconsistente: o instalador tem `phone`/`branch` atualizados, mas o `users` não.

**Por que impacta:** Admin que edita telefone/filial de instalador via UI vê mudança no instalador mas não no usuário. Possível inconsistência de dados que causa erros de login ou relatórios.

**Correção:** Avaliar se a exclusão é intencional. Se não:
```python
update_data = {k: v for k, v in user_data.items() if k not in ['id', 'created_at', 'password']}
```

---

## Categoria 2 — Código Morto e Não Utilizado

### 🟢 MORT-01 — `GamificationReport.jsx` importado mas rota desativada

**Arquivo:** `frontend/src/App.js` linhas 113-115 (comentado)

Páginas `LojaFaixaPreta` e `GamificationReport` estão comentadas no lazy-load mas os arquivos físicos existem em `frontend/src/pages/GamificationReport.jsx` e `LojaFaixaPreta.jsx`. Não bloqueiam, mas aumentam o tamanho do bundle (foram incluídas no build mesmo sem rota).

**Status:** Baixo impacto — CRA com lazy loading não inclui módulos não importados. Os arquivos são dead code mas inofensivos.

---

### 🟢 MORT-02 — `database.py` e `database_supabase.py` — arquivos legados

**Arquivos:** `backend/database.py`, `backend/database_supabase.py`

Dois arquivos Python na raiz do backend que parecem ser versões anteriores do wrapper de banco, substituídos pelo `db_supabase.py` ativo. Nenhum `import` ativo aponta para eles.

**Verificação necessária:** `grep -r "from database import\|import database" backend/` para confirmar que nenhuma rota os importa antes de deletar.

---

### 🟢 MORT-03 — `update_productivity_history` em `checkins.py` — função vazia

**Arquivo:** `backend/routes/checkins.py` linhas 57-60

```python
async def update_productivity_history(installed_product):
    """Update productivity history aggregates."""
    # This is called after product installation to update benchmarks
    pass  # Implementation kept simple for now
```

Chamada em dois lugares dentro do mesmo arquivo mas não faz nada. Gera round-trip de `async/await` desnecessário.

---

## Categoria 3 — Clean Code

### 🟡 CORR-07 — `Dashboard.jsx` — 930 linhas, 3 subcomponentes definidos dentro do corpo

**Arquivo:** `frontend/src/pages/Dashboard.jsx` (930 linhas)

`MetricsSkeleton`, `AlertsSkeleton`, `JobsSkeleton` e `Skeleton` são definidos como funções dentro do componente `Dashboard`, recriadas a cada render. Lógica de formatação de WhatsApp (`formatPhoneForWhatsApp`, `openWhatsApp`) também dentro do escopo do componente.

**Por que impacta:** Manutenibilidade. Não é bloqueador de produção.

**Correção:** Extrair esqueletos para arquivo `components/ui/DashboardSkeletons.jsx` e helpers WhatsApp para `utils/whatsapp.js`.

---

### 🟢 MELHO-01 — Magic strings de status de job duplicadas em 4+ arquivos

**Arquivos:** `Dashboard.jsx`, `Jobs.jsx`, `InstallerDashboard.jsx`, `Calendar.jsx`

Status como `'completed'`, `'finalizado'`, `'in_progress'`, `'instalando'`, `'pausado'`, `'atrasado'`, `'aguardando'` são verificados com `===` diretamente em cada arquivo sem constante centralizada. Qualquer mudança de status no backend requer atualização em múltiplos lugares.

**Correção:** Criar `frontend/src/lib/jobStatus.js`:
```js
export const JOB_STATUS = { COMPLETED: 'completed', FINALIZADO: 'finalizado', ... };
export const isCompleted = (s) => s === JOB_STATUS.COMPLETED || s === JOB_STATUS.FINALIZADO;
```

---

### 🟢 MELHO-02 — `detect_product_family` duplicada em `checkins.py` e `item_checkins.py`

**Arquivos:** `backend/routes/checkins.py` linhas 22-54, `backend/routes/item_checkins.py` linhas 87+

Função com lógica idêntica copiada entre dois módulos. Mutação futura de keywords requer alteração em dois lugares.

**Correção:** Mover para `backend/services/product_classifier.py` (já existe) e importar nos dois módulos.

---

## Categoria 4 — Segurança

### 🟡 CORR-08 — Emails hardcoded em `jobs.py` — vazam no response JSON

**Arquivo:** `backend/routes/jobs.py` linhas 113, 2193

```python
NOTIFICATION_EMAILS = ["bruno@industriavisual.com.br", "marcelo@industriavisual.com.br"]
```

Esses endereços são retornados no response JSON da rota de justificativa:
```python
"emails_sent_to": NOTIFICATION_EMAILS
```

**Por que impacta:** Qualquer usuário autenticado pode chamar a rota e descobrir os emails de notificação internos. Exposição desnecessária.

**Correção:**
1. Mover para env var: `NOTIFICATION_EMAILS = os.environ.get('NOTIFICATION_EMAILS', '').split(',')` em `config.py`
2. Remover `emails_sent_to` do response ou substituir por count: `"emails_sent": len(NOTIFICATION_EMAILS)`

---

### 🟡 CORR-09 (já documentado como PENDING-003) — `VAPID_CLAIMS_EMAIL` hardcoded em `config.py`

**Arquivo:** `backend/config.py` linha 47

```python
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'bruno@industriavisual.com.br')
```

O fallback hardcoded é desnecessário — `VAPID_CLAIMS_EMAIL` deve ser obrigatório se VAPID estiver habilitado. Se a env não for setada, o default vaza o email pessoal no header das push notifications.

**Correção:** Sem default, ou default para um email de sistema (`noreply@instal-visual.com.br`).

---

**Categoria 4 — Itens sem achado:**
- `dangerouslySetInnerHTML`: Nenhuma ocorrência encontrada.
- URLs de API hardcoded no frontend: Nenhuma — todas usam `process.env.REACT_APP_BACKEND_URL`.
- SQL injection: Não aplicável — toda interação é via wrapper PostgREST com parâmetros tipados.

---

## Categoria 5 — UX em Estados Não-Felizes

### 🟢 MELHO-03 — `Calendar.jsx` — `listVisitas` silencia erro com `catch(() => ...)`

**Arquivo:** `frontend/src/pages/Calendar.jsx` linha 108

```js
api.listVisitas().catch(() => ({ data: [] })),
```

Visitas que falham simplesmente não aparecem, sem nenhum aviso ao usuário. O calendário mostra apenas jobs, podendo confundir gerentes que esperam ver VTs.

**Correção:**
```js
api.listVisitas().catch(err => {
  console.warn('[Calendar] listVisitas falhou:', err?.message);
  toast.warning('Não foi possível carregar visitas técnicas');
  return { data: [] };
}),
```

---

### 🟢 MELHO-04 — `VisitasTecnicas.jsx` — estado vazio não tem botão de "criar primeira VT"

**Arquivo:** `frontend/src/pages/VisitasTecnicas.jsx`

Quando não há visitas, o estado vazio mostra mensagem mas nenhum CTA direto para criação. Para novos usuários (managers sem visitas), a UX é confusa.

**Correção:** Adicionar botão "Criar primeira visita" no estado vazio condicional por role.

---

### 🟢 MELHO-05 — Página de login mostra `© 2025` — desatualizado

**Arquivo:** `frontend/src/pages/Login.jsx` linha 117

```jsx
<p>© 2025 INDÚSTRIA VISUAL</p>
```

Ano desatualizado (2025 quando data atual é 2026).

**Correção:** `© {new Date().getFullYear()} INDÚSTRIA VISUAL`

---

## Categoria 6 — Backend Python (FastAPI)

### ✅ Rotas sem `Depends(get_current_user)` — Nenhuma encontrada

Todas as rotas protegidas verificadas (`/jobs`, `/checkins`, `/item-checkins`, `/users`, `/installers`, `/visitas`, `/reports`, `/gamification`, `/notifications`, `/calendar`, `/catalogos`) usam `Depends(get_current_user)` corretamente. A rota `/notifications/vapid-public-key` é intencionalmente pública (necessária para service worker antes do login).

### ✅ Cron endpoint — protegido corretamente

`/api/cron/sync-holdprint` (server.py linha 157) exige `Authorization: Bearer <CRON_SECRET>` e falha-fechado se `CRON_SECRET` não estiver configurado. Correto.

### ✅ `except Exception: pass` — Nenhuma ocorrência

Nenhum bloco Python com `except` silencioso encontrado. Todos os `except Exception` no código logam o erro.

### 🟡 CORR-04 — (já documentado acima) — `reset_password` — expiração pode ser bypassada

Ver CORR-04.

---

## Plano de Refatoração Priorizado

### Prioridade 1 — Bloqueadores (corrigir antes do próximo deploy)

| ID | Ação | Arquivo | Esforço |
|---|---|---|---|
| BLOQ-01 | Adicionar `else { setLoading(false) }` no Users.jsx | `frontend/src/pages/Users.jsx:36` | 5 min |
| BLOQ-02 | Adicionar `\|\| []` no setInstallers de Checkins.jsx | `frontend/src/pages/Checkins.jsx:338` | 2 min |
| BLOQ-03 | Adicionar CSP `script-src 'self'` no `vercel.json` (mitigação XSS) | `vercel.json` | 30 min |

### Prioridade 2 — Deve corrigir (próximo sprint)

| ID | Ação | Arquivo | Esforço |
|---|---|---|---|
| CORR-01 | Logar erro do Visual Connect catch | `InstallerJobDetail.jsx:171` | 2 min |
| CORR-04 | Corrigir lógica de expiração de token no reset-password | `auth_new.py:498-511` | 15 min |
| CORR-06 | Avaliar exclusão de phone/branch em update_user | `users.py:44` | 10 min |
| CORR-07 | Quebrar Dashboard.jsx em subcomponentes | `Dashboard.jsx` | 2h |
| CORR-08 | Mover NOTIFICATION_EMAILS para env var e remover do response | `jobs.py:113,2193` | 20 min |
| CORR-09 | Remover default hardcoded de VAPID_CLAIMS_EMAIL | `config.py:47` | 2 min |

### Prioridade 3 — Melhorias (backlog)

| ID | Ação | Arquivo | Esforço |
|---|---|---|---|
| MORT-02 | Deletar database.py e database_supabase.py (após verificar imports) | `backend/` | 10 min |
| MORT-03 | Remover `update_productivity_history` vazia ou implementar | `checkins.py:57` | 1h |
| MELHO-01 | Centralizar constantes de status de job | `lib/jobStatus.js` (novo) | 1h |
| MELHO-02 | Deduplicate `detect_product_family` | `services/product_classifier.py` | 30 min |
| MELHO-03 | Adicionar toast de warning em Calendar quando VTs falharem | `Calendar.jsx:108` | 5 min |
| MELHO-05 | Corrigir ano do copyright no Login | `Login.jsx:117` | 1 min |

---

## Pendências Pré-Existentes (do CLAUDE.md) — Status Verificado

| Pendência | Status |
|---|---|
| PENDING-001: `$inc` não atômico | Ainda presente em `db_supabase.py` |
| PENDING-002: `add_coins()` async sem await | Gamification desativada — risco suspenso |
| PENDING-003: Inconsistência nivel gamificação | Gamification desativada — risco suspenso |
| PENDING-004: `update_many` delega para `update_one` | Ainda presente em `db_supabase.py` |
| Migrations 038, 039 | Status não verificável via código — requer Supabase dashboard |
| Envs `REACT_APP_VISUAL_CONNECT_URL/_KEY` e `INLINE_RUNTIME_CHUNK` | Não verificável via código — requer Vercel dashboard |

---

*Auditoria baseada em leitura direta dos arquivos. Nenhuma modificação foi feita ao código.*
