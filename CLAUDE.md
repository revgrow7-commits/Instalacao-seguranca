# Indústria Visual — instal-visual.com.br

Sistema full-stack de gestão operacional de instalações de comunicação visual. Controla o ciclo completo: importação de jobs do Holdprint → agendamento → check-in em campo pelo instalador (com GPS e foto) → gamificação → relatórios.

- **URL prod:** `https://instal-visual.com.br`
- **Projeto Supabase:** `qfsxtwkltfraounsjjah` (instal-visual.com.br) — **NÃO confundir** com `otyrrvkixegiqsthmaaj` (somos-industriavisual.com.br)
- **Plataforma:** Vercel (frontend CRA + backend FastAPI Python serverless)
- **Idioma:** Português do Brasil
- **Tema:** Dark mode, cor de destaque rosa `#e94560`

> 📋 **Auditoria pré-produção em andamento** — ver `AUDITORIA-STATUS.md` (memória de retomada) e `AUDITORIA-PRE-PRODUCAO.md` (relatório completo). Feito no código: B1, M1, M2, M3, M4, M5, M6 + correção do `find/find_one` que engoliam erros. **Pendências manuais:** rodar migrations `038_login_attempts.sql` e `039_increment_field_atomic.sql` no Supabase + setar envs `REACT_APP_VISUAL_CONNECT_URL/_KEY` e `INLINE_RUNTIME_CHUNK=false` na Vercel. Feitos também: M7 (paginação opt-in backend) e P1-A (CSP Report-Only). Faltam M8, M9, adoção da paginação no frontend e melhorias 🟢 (ver `PLANO-DE-MELHORIA.md`).

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 (CRA), JavaScript, Axios |
| Backend | Python 3.x + FastAPI (síncrono, serverless) |
| Banco | Supabase PostgreSQL (via wrapper `db_supabase.py`) |
| Auth | JWT (HS256), bcrypt, Resend (email reset) |
| Storage | Supabase Storage — bucket `checkin-photos` |
| Deploy | Vercel: frontend em `/`, backend em `/_/backend` |
| Push | VAPID Web Push via `py-vapid` |
| Cron | Vercel Cron — `GET /api/cron/sync-holdprint` (09:00 UTC / 06:00 BRT) |
| Integrações | Holdprint API, Google Calendar OAuth, Resend |

---

## Estrutura de Diretórios

```
/
├── frontend/
│   └── src/
│       ├── App.js               — rotas + AuthProvider
│       ├── context/
│       │   └── AuthContext.jsx  — único contexto de auth
│       ├── hooks/               — hooks customizados com Axios (NÃO React Query)
│       │   ├── useJobs.js
│       │   ├── useVisitas.js    — visitas técnicas
│       │   ├── useCatalogos.js  — vendedores, tipos de serviço, ferramentas
│       │   └── usePushNotifications.js
│       ├── components/
│       │   ├── layout/          — shell da aplicação
│       │   ├── ui/              — componentes base reutilizáveis
│       │   └── visitas/         — componentes de visitas técnicas
│       ├── pages/               — uma page por rota
│       ├── lib/                 — utilitários compartilhados
│       └── utils/
│           ├── api.js           — wrapper Axios com cache e interceptors
│           └── tokenManager.js  — JWT no localStorage com controle de expiração
│
├── backend/
│   ├── server.py        — app FastAPI, include de todos os routers + cron
│   ├── config.py        — todas as constantes e variáveis de ambiente
│   ├── security.py      — JWT decode, bcrypt, get_current_user, require_role
│   ├── db_supabase.py   — wrapper MongoDB-like sobre Supabase (SupabaseDB, SupabaseTable)
│   ├── routes/          — 15 módulos de rota (um por domínio)
│   ├── services/        — lógica de negócio: gamification, gps, holdprint, image, email
│   ├── models/          — Pydantic models: user, job, checkin, visita, gamification
│   └── migrations/      — SQL executado manualmente no Supabase
│
├── vercel.json          — roteamento Vercel: frontend em /, backend em /_/backend
└── CLAUDE.md            — este arquivo
```

---

## Módulos e Rotas

### Frontend (páginas)

| Página | Rota | Acesso |
|---|---|---|
| `Dashboard.jsx` | `/dashboard` | todos |
| `Jobs.jsx` | `/jobs` | admin, manager |
| `Checkins.jsx` | `/checkins` | admin, manager |
| `CheckinViewer.jsx` | `/checkin-viewer/:id` | todos |
| `Calendar.jsx` | `/calendar` | admin, manager |
| `InstallerCalendar.jsx` | `/installer-calendar` | installer |
| `InstallerDashboard.jsx` | `/installer` | installer |
| `InstallerJobDetail.jsx` | `/installer/job/:id` | installer |
| `VisitasTecnicas.jsx` | `/visitas` | admin, manager |
| `VisitaDetail.jsx` | `/visita/:id` | todos |
| `UnifiedReports.jsx` | `/reports` | admin, manager |
| `FamilyKPIsReport.jsx` | `/reports/kpis` | admin, manager |
| `GamificationReport.jsx` | `/gamification-report` | admin, manager |
| `SchedulerAdmin.jsx` | `/admin/scheduler` | admin |
| `Users.jsx` | `/users` | admin |
| `LojaFaixaPreta.jsx` | `/loja` | todos |

### Backend (rotas `/api/...`)

| Módulo | Prefixo | Responsabilidade |
|---|---|---|
| `auth_new.py` | `/auth` | login, register, forgot/reset/change password |
| `users.py` | `/users` | CRUD usuários |
| `jobs.py` | `/jobs` | CRUD + status + sync Holdprint |
| `checkins.py` | `/checkins` | check-ins gerais |
| `item_checkins.py` | `/item-checkins` | check-ins por item de job |
| `installers.py` | `/installers` | CRUD instaladores + GPS alerts |
| `visitas.py` | `/visitas` | ciclo completo de visitas técnicas |
| `visitas_reports.py` | `/visitas/reports` | relatórios de VTs |
| `catalogos.py` | `/catalogos` | vendedores, tipos de serviço, ferramentas VT |
| `gamification.py` | `/gamification` | moedas, níveis, recompensas |
| `reports.py` | `/reports` | relatórios gerenciais |
| `products.py` | `/products` | catálogo de produtos e famílias |
| `calendar.py` | `/calendar` | calendário + Google Calendar OAuth |
| `notifications.py` | `/notifications` | push notifications VAPID |
| `integration.py` | `/integration` | sync manual Holdprint |
| `cs_integration.py` | `/cs` | integração CS (visitas) |
| `server.py` (inline) | `/admin`, `/scheduler`, `/cron`, `/location-alerts` | rotas administrativas |

---

## Autenticação

### Frontend — tokenManager + AuthContext
- JWT armazenado em `localStorage` via `tokenManager.js`
- Snapshot de usuário em `sessionStorage` com TTL de 5 minutos (evita flash de loading no reload)
- Expiração frontend: **7 dias** por padrão em `tokenManager.setToken(token, expiresInDays=7)`
- `AuthContext` expõe: `user`, `loading`, `login()`, `logout()`, `isAdmin`, `isManager`, `isInstaller`, `token`, `getToken`

### Backend — security.py
- Expiração backend: **7 dias** (`ACCESS_TOKEN_EXPIRE_DAYS = 7` em `config.py`) — alinhado com frontend (2026-05-15)
- Algoritmo: HS256, secret via env `JWT_SECRET`
- `get_current_user()` decodifica JWT e busca o usuário em `db.users`
- `require_role(user, [UserRole.ADMIN])` lança HTTP 403 se role insuficiente

### Roles
```python
class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    INSTALLER = "installer"
```

---

## Camada de Banco (`db_supabase.py`)

O backend usa uma **abstração MongoDB-like** sobre o Supabase PostgreSQL. Isso permite usar sintaxe familiar sem reescrever toda a lógica:

```python
# Estilo MongoDB — o que o código usa
db.jobs.find({"status": "AGUARDANDO"})
db.users.find_one({"email": email})
db.checkins.insert_one({"job_id": job_id, ...})
db.jobs.update_one({"id": job_id}, {"$set": {"status": "INSTALANDO"}})
db.jobs.update_one({"id": job_id}, {"$inc": {"total_jobs": 1}})

# O que acontece internamente — Supabase PostgREST
supabase.table("jobs").select("*").eq("status", "AGUARDANDO").execute()
```

### Operadores suportados
| MongoDB | Supabase equivalente |
|---|---|
| `$set` | `update(data)` |
| `$inc` | read-then-write (NÃO atômico — ver ARCH-003) |
| `$push` | read-then-write com append |
| `$or` | `.or_("field.eq.val1,field.eq.val2")` |
| `$in` | `.in_(field, list)` |
| `$gte/$lte/$gt/$lt` | `.gte/.lte/.gt/.lt` |
| `$regex` | `.ilike(field, "%val%")` |

### `_filter_columns()`
Antes de qualquer insert/update, campos desconhecidos são removidos via `TABLE_COLUMNS` registry. Evita erros 400 do PostgREST por colunas inexistentes. **Se adicionar uma coluna no banco, adicionar no registry também.**

### JSONB
Campos JSONB (`items`, `holdprint_data`, `products_with_area`, etc.) são tratados nativamente — não usar `json.dumps` ao escrever nem `json.loads` ao ler.

---

## Gamificação

### Backend (`services/gamification.py`)
- `add_coins(user_id, amount, ...)` — soma moedas em `gamification_balances` (read-then-write, NÃO atômico)
- `calculate_level(total_earned)` — retorna int 1–10 baseado em moedas acumuladas
- Tabelas: `gamification_balances`, `coin_transactions`, `rewards`, `reward_requests`

### Inconsistência de schema de níveis
`gamification_balances` tem dois campos de nível:
- `current_level`: string legada ("bronze", "silver", "gold"...)
- `level`: string numérica ("1", "2", ... "10") — schema atual

Ao ler nível, sempre usar `level` (numérico). `current_level` existe por compatibilidade retroativa.

---

## GPS e Check-in de Campo

- **Distância máxima para checkout:** `MAX_CHECKOUT_DISTANCE_METERS = 500` metros (configurável em `config.py`)
- Alertas de localização são gravados em `location_alerts` quando instalador faz checkout fora do raio
- Campos GPS nos checkins: `gps_lat`, `gps_long` (entrada), `checkout_gps_lat`, `checkout_gps_long` (saída)
- Upload de fotos: base64 → Supabase Storage bucket `checkin-photos` → URL pública gravada no banco; se falhar, base64 fica no banco como fallback

---

## Variáveis de Ambiente Obrigatórias

```bash
# Supabase (obrigatório)
SUPABASE_URL=https://qfsxtwkltfraounsjjah.supabase.co
SUPABASE_SERVICE_KEY=...

# JWT (obrigatório — gerar com: openssl rand -hex 32)
JWT_SECRET=...

# Holdprint
HOLDPRINT_API_KEY_POA=...
HOLDPRINT_API_KEY_SP=...

# Email (reset de senha)
RESEND_API_KEY=...
SENDER_EMAIL=noreply@instal-visual.com.br

# Google Calendar
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...

# Web Push
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

# Cron (segurança do endpoint de sync)
CRON_SECRET=...

# Frontend
REACT_APP_BACKEND_URL=https://instal-visual.com.br
```

---

## Padrões Obrigatórios

### Toda rota protegida precisa de `Depends(get_current_user)`
```python
# ✅ CORRETO
@router.get("/jobs")
def list_jobs(current_user: User = Depends(get_current_user)):
    ...

# ❌ ERRADO — rota pública sem querer
@router.get("/jobs")
def list_jobs():
    ...
```

### `require_role` antes de qualquer ação destrutiva
```python
require_role(current_user, [UserRole.ADMIN])
```

### Inserir no `TABLE_COLUMNS` ao criar coluna nova
Ao executar migration que adiciona coluna, adicionar o campo em `db_supabase.py` → `TABLE_COLUMNS[tabela]`, senão `_filter_columns()` vai silenciosamente descartar o campo.

### Verificar erros do `insert_one` / `update_one`
`SupabaseTable.insert_one()` lança exceção em caso de erro. Capturar no caller se necessário para retornar erro HTTP correto.

### Cron protegido pelo header Vercel
```python
is_vercel_cron = request.headers.get('x-vercel-cron') == '1'
```
Não remover essa verificação.

---

## Decisões Arquiteturais Registradas

### ARCH-001: Wrapper MongoDB-like sobre Supabase
O backend usa sintaxe MongoDB (`find`, `insert_one`, `$set`, `$inc`) implementada como wrapper sobre o Supabase PostgREST. Isso facilita a leitura do código legado mas esconde funcionalidades SQL (joins, transações, RPC atômico). Ver `docs/adr/0001-db-wrapper-mongodb.md`.

### ARCH-002: JWT expira em 7 dias (backend e frontend, alinhados)
Backend e frontend usam **7 dias** — `ACCESS_TOKEN_EXPIRE_DAYS = 7` em `config.py` e `tokenManager.setToken(token, expiresInDays=7)` — alinhados desde 2026-05-15. O prazo de 7 dias evita forçar login diário nos dispositivos móveis dos instaladores. O `AuthContext` captura o 401 de `/auth/me` e faz logout automático. (Histórico: o ADR `docs/adr/0002-jwt-expiry-assimetria.md` descrevia uma assimetria 1d/7d que **não existe mais** no código — corrigido neste documento em 2026-06-11.)

### ARCH-003: `$inc` e `add_coins` não são atômicos (dívida técnica)
`db.update_one({...}, {"$inc": {"field": 1}})` faz read-then-write. Em `add_coins()` também. Race condition possível sob carga. Correção: RPC Supabase atômica. Ver TASKS.md BUG-001.

### ARCH-004: CORS wildcard em produção (risco de segurança)
`allow_origins = CORS_ORIGINS` env, default `"*"`. Configurar a env `CORS_ORIGINS` com domínios específicos em produção. Ver `docs/adr/0004-cors-wildcard.md`.

### ARCH-005: `_filter_columns()` como proteção de schema
Evita erros 400 do Supabase por campos desconhecidos. Custo: campos novos adicionados ao banco mas não ao `TABLE_COLUMNS` são descartados silenciosamente. Sempre atualizar o registry ao criar migrations.

---

## Bugs Conhecidos / Pendentes

### PENDING-001: `$inc` não atômico — race condition em contadores
**Arquivo:** `backend/db_supabase.py` (`$inc` handler em `update_one` + `_apply_inc_atomico`)
**Impacto:** Dois updates concorrentes do mesmo campo numérico (ex: `total_jobs` do instalador) podem perder um incremento.
**Status (2026-06-11):** ✅ **corrigido no código** — `update_one` chama `_apply_inc_atomico`, que faz o incremento atômico via RPC Postgres `increment_field`; se a RPC não existir, cai no fallback read-then-write (não-quebrável). **Pendente manual:** aplicar a migration `039_increment_field_atomic.sql` no Supabase para ativar o caminho atômico (sem ela, roda o fallback não-atômico).

### PENDING-002: `add_coins()` assíncrona mas chamada de forma síncrona
**Arquivo:** `backend/services/gamification.py` linha 45 — `async def add_coins()`
**Impacto:** Chamadores que não fazem `await` recebem uma coroutine em vez do resultado.
**Status (2026-06-11):** ⏸ **em espera** — módulo de gamificação **desabilitado desde 2026-05-15** (router não incluído no `server.py`, ver linha comentada). Sem impacto em produção enquanto inativo. Resolver apenas se a gamificação for reativada (decisão de negócio pendente — arquivos mantidos de propósito).

### PENDING-003: Inconsistência no schema de nível de gamificação
**Arquivo:** `backend/services/gamification.py` — `level` (numérico "1"-"10") vs `current_level` (string "bronze"/"silver")
**Impacto:** Frontend pode exibir nível errado dependendo de qual campo usa.
**Status (2026-06-11):** ⏸ **em espera** — mesma situação do PENDING-002 (gamificação desabilitada). Ao ler nível, usar sempre `level` (numérico). Resolver só se reativar.

### PENDING-004: `update_many` delega para `update_one`
**Arquivo:** `backend/db_supabase.py`
**Impacto:** `db.table.update_many({...}, {...})` / `delete_many` afetavam só 1 registro conceitualmente.
**Status (2026-06-11):** ✅ **RESOLVIDO** — `update_many`/`delete_many` implementados de verdade: DELETE/UPDATE set-based com `_apply_filter` (suporta operadores como `$in`), e `$inc`/`$push` aplicados por-linha (valor depende do registro atual). Assinatura preservada.

### PENDING-005: Senha mínima de 6 caracteres em auto-registro
**Arquivo:** `backend/routes/auth_new.py`
**Impacto:** Força bruta facilitada em contas de instaladores.
**Status (2026-06-11):** ✅ **RESOLVIDO** — todos os caminhos de senha usam `validar_forca_senha` (mín. 8 chars + letra + número): `register`/`self-register`/`admin-register` (auth_new.py) e `change-password`/admin reset (users.py). Política unificada.

---

## Histórico de Correções Relevantes (sessão 2026-05-08)

| Arquivo | Correção |
|---|---|
| `frontend/src/hooks/useCatalogos.js` | 6 erros silenciosos (`.catch(() => {})` → `.catch(e => console.error(...))`) |
| `frontend/src/hooks/usePushNotifications.js` | Uso correto de `navigator.serviceWorker.ready` (global, não da instância) |

## Incidente 2026-05-13 — `FUNCTION_INVOCATION_FAILED` em produção

**Sintoma:** `api.instal-visual.com.br/*` retornava `FUNCTION_INVOCATION_FAILED` no commit `12bf1206` (Revert do `55ac9657`).

**Diagnóstico:**
- Build do Python passa limpo, falha é runtime (ImportError ao carregar `server.py`).
- Suspeita principal: commit `990e03be` ("feat: WhatsApp + push via Edge Function + email VT geral") removeu `PyJWT` e `Pillow` do `requirements.txt`. A remoção do PyJWT é correta (`python-jose` cobre), mas há 3 `from PIL import Image` em `services/image.py`, `routes/checkins.py`, `routes/item_checkins.py` — todas dentro de funções, então não disparam ImportError no module-load. A causa raiz exata só pode ser confirmada com `git pull` + `python -c "from server import app"` no working tree no SHA `12bf1206`.

**Resolução temporária:**
- Promovido `dpl_AzWWn7FPrxEbebxSzPN5t3Z9V8j5` (commit `82029d06`, SHA antes dos commits problemáticos) no projeto Vercel `backend` via `POST /v10/projects/.../promote/...`. Backend voltou a responder JSON.
- Frontend `instalacao-seguranca` já estava em `dc6e9de0` (promote anterior). Frontend e backend agora em commits diferentes — features pós-`82029d06` (WhatsApp button, paginação calendar, edge function push) podem retornar 404 quando o frontend chama endpoints que o backend `82029d06` não tem.

**Banco (Supabase `qfsxtwkltfraounsjjah`):**
- Aplicada migration `028_rls_initplan_job_item_assignments` (otimização de RLS que faltou em 027).
- Confirmadas as 5/5 policies RLS de `public` com `(SELECT auth.uid())`.
- Confirmadas as migrations 023, 024, 025, 027, 029 (e a 028 informalmente). Schema 100% sincronizado.
- Zero ERROR-level findings nos advisors de segurança.

**Resolução definitiva (2026-05-14 — commit `2f53ede`):**
- Raiz do bug de login: frontend chamava `REACT_APP_BACKEND_URL + /api` = `/api/...` que serveia o SPA CRA, não o FastAPI
- Backend (projeto Vercel monorepo `redeploy`) usa `experimentalServices`, expõe FastAPI em `/_/backend/api/*`
- `REACT_APP_BACKEND_URL` atualizado de `https://backend-henna-one-82.vercel.app` para `https://backend-henna-one-82.vercel.app/_/backend`
- Interceptor 401 em `api.js` corrigido: exceção para `/auth/login` + `clear()` → `clearToken()`
- Pillow restaurado em `requirements.txt` (commit `40a9393` + `2f53ede`)
- Frontend promovido a produção: `dpl_GeJ55JfbpbT85YqaFkm8kZDqiPRH` serve `instal-visual.com.br`

**MCPs locais adicionados:**
- `vercel-write` em `vercel-mcp-write/server.mjs` — expõe `promote_deployment`, `redeploy_deployment`, `create/update/delete/list_env_vars`, `delete_deployment` via REST API direta da Vercel. Configurado em `claude_desktop_config.json`.

**Dívida de segurança:**
- Token Vercel `vcp_...` e n8n JWT estão em texto-claro no `claude_desktop_config.json` E no histórico de uma conversa Cowork (esposição de print do usuário). Rotacionar ambos em até 24h.

## Sessão 2026-06-11 — Limpeza, estabilidade e performance (auditoria `PLANO-LIMPEZA-E-PERFORMANCE.md`)

Commits atômicos (branch `main`, **não** deployados/pushados — aguardando autorização):

1. `fix: correções da auditoria 2026-06-11` — senha (política unificada em users.py), logging dos `except: pass` (item_checkins.py), cache TTL de `product_families` (checkins.py), guard de unmount (Dashboard.jsx), log no catch do Visual Connect (InstallerJobDetail.jsx).
2. `chore: remove código morto` — 4 arquivos backend mortos (database.py, database_supabase.py com URL do projeto **errado**, 2 migrations one-off), 4 componentes frontend nunca importados, 23 componentes shadcn/ui órfãos + cluster toast/toaster/use-toast (app usa `sonner` direto), `test_reports/` e `test_result.md`. **Gamificação NÃO foi tocada** (decisão de negócio).
3. `fix(oauth)` — valida `state` HMAC **antes** do exchange do code no `google_callback` (era CSRF: validava depois e tinha fallback inseguro por email); retorna 400 em mismatch.
4. `fix(db)` — `update_many`/`delete_many` reais (PENDING-004).
5. `fix: remove rota duplicada de reset de senha` — removida a de `auth_new.py` (`/auth/users/{id}/reset-password`, código morto); mantida a de `users.py` que o frontend chama.
6. `perf(oauth)` — `google_callback` de `async def` → `def` (não bloqueia o event loop; usa requests/DB síncronos).
7. `fix(sw)` — remove listeners do Service Worker (`updatefound`/`statechange`/`controllerchange`) no cleanup do `useEffect` (UpdateNotification.jsx).
8. `perf(reports)` — `/reports/by-installer` de O(n³) → O(n) via pré-indexação dos checkins (JSON de resposta idêntico).
9. `perf(api)` — `getJobById` agora delega para `getJob` (com cache 20s); alias deprecado mantido.
10. `perf(jobs)` — callbacks do `JobCard` (já `React.memo`) estabilizados via `useCallback`.
11. `perf(img)` — `loading="lazy"` + `decoding="async"` nas fotos (JobDetail.jsx, UnifiedReports.jsx).
12. `docs` — esta seção + ARCH-002 (JWT 7d) + status PENDING-001..005.

**Pendências manuais (NÃO executadas — fora do meu escopo de permissão):**
- **Supabase** (`qfsxtwkltfraounsjjah`): rodar migrations `038_login_attempts.sql` (throttle de brute-force está fail-open) e `039_increment_field_atomic.sql` (ativa o `$inc` atômico — hoje roda fallback).
- **Vercel:** setar `REACT_APP_VISUAL_CONNECT_URL` / `REACT_APP_VISUAL_CONNECT_KEY` e `INLINE_RUNTIME_CHUNK=false`.
- **Lixo local** não-versionado removido: `.claude/worktrees/`, `backend/supabase/.temp/` (eram cópias do repo lotando o disco).

**Nota de ambiente:** o import `python -c "from server import app"` não roda neste host (Python 3.14 + starlette 1.0.0 incompatível com o `requirements.txt` que fixa `starlette<1.0.0`); validação backend feita via `py_compile`/`compileall`. Frontend validado com `npm run build` (Compiled successfully) após cada fase.

---

## Comandos Úteis

```bash
# Dev frontend
cd frontend && npm start

# Dev backend
cd backend && uvicorn server:app --reload

# Type check (JS — sem TypeScript, verificar erros de importação)
cd frontend && npm run build 2>&1 | grep -i error

# Buscar rotas sem proteção de auth
grep -r "def " backend/routes/ --include="*.py" -A 2 | grep -v "Depends\|#\|\"\"\"" | grep "def [a-z]"

# Buscar callers de add_coins (verificar await)
grep -r "add_coins" backend/routes/ --include="*.py"

# Verificar campos em TABLE_COLUMNS vs migrations recentes
grep -r "ALTER TABLE\|ADD COLUMN" backend/migrations/ --include="*.sql" | tail -20
```

## Sessao 2026-06-11 (tarde) � Remocao da gamificacao + fixes EXIF

- **Gamificacao REMOVIDA por completo** (commit `ab6f3bf`, decisao de negocio): rotas, services, models, paginas, componentes, flags. Tabelas `gamification_*`/`coin_transactions`/`rewards`/`reward_requests` mantidas no banco como historico, sem uso no codigo. PENDING-002/003 encerrados.
- **Pipeline EXIF corrigido** (commit `b3dc310`): validacao de timeline do checkout e `_parse_dt` dos reports agora assumem BRT para horarios naive (antes UTC � erro de 3h); tela do instalador usa `exifTimeHM` (TZ America/Sao_Paulo fixo); TDZ no CheckinViewer corrigida; filtro de data do UnifiedReports com fuso fixo BRT.
- Sentinel do index.html preserva querystring (`?token=` do reset de senha) � commit `561e997`.
- Docs criados: `docs/business/produto.md`, `docs/architecture/arquitetura.md`, `docs/ux/fluxos.md`, `docs/RESUMO-EXECUTIVO-2026-06-11.md`.
- Deploys: frontend (`instalacao-seguranca`) e backend (`backend-henna-one-82`) em producao com tudo acima. Verificado: `/api/gamification/*` retorna 404; sentinel novo no ar.

## Sessao 2026-06-12 — Pendencias operacionais da auditoria (3 itens)

- **✅ Pendencia 1 (Supabase) — CONCLUIDA.** Migrations `038_login_attempts.sql` e `039_increment_field_atomic.sql` aplicadas no projeto `qfsxtwkltfraounsjjah` (LINKED confirmado, ● na lista; `otyrrvkixegiqsthmaaj` nunca tocado) via `supabase db query --linked -f`. Validado: `login_attempts` existe (2 indices, RLS ON) → throttle de brute-force (`auth_new.py`) saiu do fail-open; RPC `increment_field(text,text,text,numeric)` existe e casa com `db_supabase.py:514`, executou no-op sem erro → `$inc` agora usa o caminho ATOMICO (`_apply_inc_atomico` retorna True, sem fallback).
- **✅ Pendencia 2 (Vercel) — CONCLUIDA (parcial por decisao de negocio).** `INLINE_RUNTIME_CHUNK=false` setado em Production/Development/Preview(main) no projeto `instalacao-seguranca` (`prj_m3EZ...`). Redeploy `vercel --prod --force` → `dpl_48sbmwEN2qVMKAjVEXuxr9KZo8Md` READY, aliased instal-visual.com.br; bundle `main.c7bf5c61.js` → `main.2dcb879b.js` (rebuild confirmado), app HTTP 200, `REACT_APP_BACKEND_URL` (`backend-henna-one-82.vercel.app/_/backend`) intacto e embutido no bundle novo. **`REACT_APP_VISUAL_CONNECT_URL/_KEY` NAO setadas de proposito** — sao opcionais/fire-and-forget (`InstallerJobDetail.jsx:146-148`, so habilitam a busca de "papel do instalador"; sem elas a tela funciona normal). A integracao ativa com o Visual Connect e a server-side via `CS_INTEGRATION_TOKEN` (`cs_integration.py`), independente dessas envs.
- **🟡 Pendencia 3 (rotacao de tokens) — JWT n8n RESOLVIDO; revogacao Vercel depende do usuario.** Confirmado por grep: o repo `Instal-supa` esta limpo (zero tokens antigos em qualquer fonte viva). **JWT n8n: ELIMINADO do config vivo** — usuario nao usa n8n, entao removida por completo a entrada `n8n-mcp` do `claude_desktop_config.json` (`mcpServers` agora `{}`, JSON validado, grep do JWT = 0). Resta apenas (opcional, higiene): deletar a API key antiga no painel do n8n, ja que ela vazou em logs imutaveis de sessao. **Tokens Vercel `vcp_6AB9PGpG...`/`vcp_73ylM5Wp...`: pendente o usuario revoga-los** em *Vercel → Account Settings → Tokens* — nao estao em nenhum config ativo (so em logs de sessao), e revoga-los nao afeta deploys (CLI usa sessao `vercel login`). Decisao: so revogar, sem recriar MCP `vercel-write`.

## Sessao 2026-06-12 (#2) — Redesign: registro de campo 100% por EXIF (sem check-in/checkout)

> Plano completo e analise (workflow de 5 agentes) em `C--Users-andre\.claude\plans\leia-...-expressive-rainbow.md`. **COMMITADO + DEPLOYADO EM PRODUCAO** (commits `76f1e94` redesign + `744cde1` fix InstallerDashboard). Backend via push->GitHub auto-deploy (`backend-git-main` Ready); frontend via `vercel --prod` (Ready, instal-visual.com.br). Verificado ao vivo: vocabulario antigo de check-in ELIMINADO de todos os chunks; "Registrar/Salvar Inicio" presente.

- **Regra:** acabou check-in/checkout cronometrado. Instalador so **carrega foto(s) de Inicio e de Fim** da galeria; horario e local vem 100% do EXIF (lido do arquivo ORIGINAL no upload, foto sem EXIF de data e recusada). Doc `REGRAS-DE-NEGOCIO.md` §3 ja refletia; codigo estava atras.
- **Fase 1 — Backend `item_checkins.py` (compila):** B1 `batch_item_checkin` passa a EXIGIR EXIF (sem `exif_timestamps` -> 400; removido fallback `now()`); `checkin_at = exif_checkin_at`. B2 `complete_item_checkout` exige `exif_datetime` (400 se ausente) e o GPS-alert agora compara `exif_lat/long` (inicio gravado x fim da foto), nao mais o clique. B3 `create_item_checkin` marcado DEPRECATED (sem chamador). Removido import morto `MIN_CHECKOUT_DURATION_SECONDS` (D1).
- **Fase 2 — Frontend `InstallerJobDetail.jsx` (build OK):** F1 vocabulario "check-in/checkout" -> "Inicio/Fim" (botoes "Salvar Inicio"/"Salvar Fim", labels "Carregar foto(s) de Inicio/Fim"). F2 removida trava de 60s + cronometro de clique (`now`/setInterval/getElapsedTime) -> mostra "Inicio registrado: HH:MM" via `exifTimeHM(exif_checkin_at)`. F3 painel concluido usa `exif_duration_minutes` + inicio/fim EXIF, produtividade recalculada por EXIF. F4 (D3) Pausar/Retomar REMOVIDO (handlers, modal Drawer, estado, fetch de pauseLogs, imports orfaos); itens legados `paused` -> tratados como `in_progress`. `api.js`: `createItemCheckin` comentado DEPRECATED.
- **Fase 3 — Gestao `/checkins` `Checkins.jsx` (build OK):** data via `exifDateTimeBR(exif_checkin_at/exif_checkout_at)` ("—" sem EXIF); duracao via `exif_duration_minutes`; **`<Cronometer>` removido** (componente + import Timer); **badge ATRASO removido** (D6, `isLate=false`); abas/concluido por `exif_checkout_at` (nao mais `checkout_at && checkout_photo`); sort por `exif_checkin_at`.
- **✅ Fase 4 (D5) — persistir fotos por fase CONCLUIDA:** migration **`045_item_checkin_photo_sets.sql`** **aplicada** no `qfsxtwkltfraounsjjah` (colunas JSONB `fotos_inicio`/`fotos_conclusao`, default `[]`, validado nos 127 registros). Registradas em `TABLE_COLUMNS['item_checkins']`. Backend: `batch_item_checkin` persiste `fotos_inicio` com **TODAS** as fotos `{url, exif_*}` (reaproveita upload da 1ª, sem base64); `complete_item_checkout` persiste `fotos_conclusao` com a foto **primária** `{url, exif_*}`. **Extras de conclusao** seguem em `job_photos` (uploadExtraPhotos, ja com EXIF) — assimetria aceita p/ baixo risco; nao exigiu mudanca de frontend (batchCheckin ja envia todas as fotos+exif_data). Compila OK.
- **Fase 2b — `InstallerDashboard.jsx` (commit `744cde1`, deployado):** ⚠ LICAO — a 1a passada SO cobriu `InstallerJobDetail.jsx` e ESQUECEU a tela PRINCIPAL do instalador (`/installer` = `InstallerDashboard.jsx`), que tem o **quick check-in** ("Check-in Rapido" via `batchCheckin`). Usuario reportou "processo continua antigo, ainda clica em checkin". Diagnostico: greppar os CHUNKS lazy-load de producao (`asset-manifest.json` -> chunks) achou strings NOVAS num chunk e ANTIGAS noutro -> `InstallerDashboard` intocado. Fix: vocabulario "Check-in" -> "Registrar/Salvar Inicio"; PhotoGalleryPicker ganhou `galleryOnly`+`requireExifDate` (faltavam!); toasts de InstallerJobDetail tambem (Check-in/Check-out realizado -> Inicio/Fim registrado). **REGRA: instalador entra por DOIS caminhos — `/installer` (Dashboard, quick-checkin) E `/installer/job/:id` (JobDetail). Mudou fluxo do instalador? Cobrir AMBOS.**
- **Fase 2c — DOIS BOTOES "Carregar fotos inicio/final" (commit `ab0a2d5`, deployado):** ⚠ LICAO 2 — eu tinha deixado um botao "Salvar Inicio/Fim" separado (= confirmar, ainda parecia check-in). Usuario foi claro: **so 2 botoes** — "Carregar fotos inicio" e "Carregar fotos final"; tocar -> galeria -> escolher -> JA envia+le EXIF+salva (sem confirmar). Implementado: `PhotoGalleryPicker` ganhou **modo botao unico** (props `onPicked`+`triggerLabel`: renderiza so 1 botao, ao selecionar dispara `onPicked(valid)` reaproveitando extracao EXIF+recusa). `InstallerJobDetail` (Inicio/Fim) e `InstallerDashboard` (card+sheet) usam esse modo; `handleItemCheckin`/`handleItemCheckout`/`handleSubmit` recebem fotos por parametro; removidos estados de acumulacao. Verificado em prod: chunks so tem "Carregar fotos inicio/final", zero "Salvar/Confirmar". **REGRA: o botao de carregar foto JA E o registro — nada de botao de confirmar.**
- **✅ Perf `/checkins` JA RESOLVIDO (commit do usuario `466bd00`, deployado):** `_select_columns` honra projecao de exclusao -> exclui fotos base64 das listagens. (Estava como pendente na nota anterior; foi commitado/deployado pelo usuario durante a sessao.)
- **Pendente com o usuario:** logar e dogfoodar telas autenticadas; revogar os 2 tokens `vcp_` no dashboard Vercel. **Nota de ambiente:** disco chegou a 100% (0 byte) durante deploy — liberado build/caches (depois 7,6 GB livres); lixo `??` de comandos malformados removido com `git clean -f` (SEM `-d`, preserva `backend/uploads/`).


---

## ⚙️ PROTOCOLO OBRIGATÓRIO DE TRABALHO (loop automático de revisão)

Estas regras valem para TODA sessão de agente neste repositório:

1. **Antes de alterar qualquer código**: ler `docs/REGRAS-DE-NEGOCIO.md` (fonte canônica do comportamento do sistema). Para áreas sensíveis, ler também o doc correspondente (`docs/architecture/arquitetura.md`, `docs/ux/fluxos.md`, `MEMORIA-INSTABILIDADE.md`).
2. **Divergência entre código e regra documentada** = parar e perguntar ao usuário; nunca "corrigir" assumindo um lado.
3. **Depois de QUALQUER alteração**: executar o loop `/revisar` (em `.claude/commands/revisar.md`) — analisar → corrigir → testar (compileall + npm run build) → validar (grep de referências órfãs + conferência contra as regras de negócio) → documentar. Repetir até 2 passadas limpas consecutivas.
4. **Mudou comportamento de negócio** ⇒ atualizar `docs/REGRAS-DE-NEGOCIO.md` no mesmo commit.
5. **Nunca** fazer deploy/push sem o usuário pedir; nunca rodar SQL fora do projeto `qfsxtwkltfraounsjjah`; nunca tocar `REACT_APP_BACKEND_URL` sem ler MEMORIA-INSTABILIDADE.md.
6. Um hook em `.claude/settings.json` compila o backend automaticamente após cada Edit/Write — se ele acusar erro de sintaxe, corrigir antes de continuar.
