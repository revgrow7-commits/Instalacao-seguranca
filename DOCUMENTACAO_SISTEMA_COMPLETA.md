# INDÚSTRIA VISUAL — Documentação Completa do Sistema

**Versão:** 3.0 (pós-incidente 14/04/2026)
**Escopo:** Banco de dados, Backend, Frontend, Deploy, Runbook de incidentes.

---

## 1. Visão geral da stack

```
 ┌─────────────────────────┐        ┌─────────────────────────┐        ┌─────────────────────────┐
 │  FRONTEND (PWA)         │ HTTPS  │  BACKEND (FastAPI)      │ HTTPS  │  SUPABASE (Postgres 17) │
 │  React 18 + CRA         │───────▶│  Python 3.11            │───────▶│  qfsxtwkltfraounsjjah   │
 │  Vercel: instalacao-    │        │  Vercel Serverless      │ REST   │  (projeto CORRETO)      │
 │  seguranca              │        │  Project: backend       │        │                         │
 └─────────────────────────┘        └─────────────────────────┘        └─────────────────────────┘
                                              │
                                              │  REST polling
                                              ▼
                                    ┌─────────────────────────┐
                                    │  Holdprint API          │
                                    │  (origem dos jobs)      │
                                    └─────────────────────────┘

 Domínios:
   Frontend (público):  https://instal-visual.com.br  (A  → 76.76.21.21, CNAME www → cname.vercel-dns.com)
   Backend (interno):   https://backend-henna-one-82.vercel.app
```

> **Regra de ouro:** `SUPABASE_URL` nas Vercel **deve** apontar para `qfsxtwkltfraounsjjah.supabase.co`. Existe também o projeto Supabase `otyrrvkixegiqsthmaaj` (vazio, legado) — **não usar**.

---

## 2. Projetos Supabase

| Projeto | Ref | Status | Uso |
|---|---|---|---|
| Instalador-seguranca (novo) | `qfsxtwkltfraounsjjah` | **ATIVO** | Único banco de produção. Todo schema e dados estão aqui. |
| Instalador-seguranca (antigo/legado) | `otyrrvkixegiqsthmaaj` | Vazio após PITR do dia 14/04/2026 | **Não usar.** Pode ser deletado após confirmar que nenhum serviço externo aponta para ele. |

URL do projeto ativo: `https://qfsxtwkltfraounsjjah.supabase.co`
Dashboard: `https://supabase.com/dashboard/project/qfsxtwkltfraounsjjah`

### 2.1 Chaves (Settings → API Keys)

- **Publishable (anon)**: `sb_publishable_...` — pode aparecer no frontend sem problema.
- **Secret (service_role)**: `sb_secret_...` — **nunca** no frontend; apenas em env vars server-side do backend.

> As chaves que foram usadas no chat em 14/04/2026 devem ser consideradas expostas. Rotacionar em Settings → API Keys → Reset e atualizar no Vercel com `vercel env`.

### 2.2 Configuração recomendada

- **RLS**: hoje está **desligado** em todas as tabelas do schema `public` (foi desligado em 14/04 como parte da recuperação). O backend usa a `service_role` key via `supabase-py`; dependemos da app para autorização. Se ativar RLS no futuro, criar explicitamente uma policy `service_role_all` por tabela ANTES de dar `ENABLE ROW LEVEL SECURITY`, senão o backend trava. Script de referência em `backend/migrations/002_cleanup_and_fix.sql`.
- **PITR**: o Supabase mantém backups automáticos. Evitar restaurar para antes da criação do schema — prefira **dumps lógicos** (`pg_dump`) antes de qualquer migração arriscada.

---

## 3. Banco de dados

### 3.1 Tabelas (schema `public`)

Fonte canônica: [backend/migrations/001_schema_completo.sql](backend/migrations/001_schema_completo.sql)
Patches/índices: [backend/migrations/002_cleanup_and_fix.sql](backend/migrations/002_cleanup_and_fix.sql)

| Tabela | Finalidade |
|---|---|
| `users` | Credenciais e perfil (admin/manager/installer). `password_hash` em bcrypt. |
| `installers` | Perfil do instalador vinculado ao `users.id`. Moedas, produtividade. |
| `jobs` | Ordens de serviço importadas da Holdprint. |
| `product_families` | Famílias de produto (painéis, letras, etc.). |
| `checkins` | Check-in/check-out (legado por job, mantido por compatibilidade). |
| `item_checkins` | Check-in/check-out **por item do job** — modelo principal hoje. |
| `item_pause_logs` | Pausas durante um item_checkin. |
| `installed_products` | Resultado consolidado de cada item instalado. |
| `productivity_history` | Agregado histórico por instalador/família. |
| `gamification_balances` | Saldo de moedas, nível. |
| `coin_transactions` | Ledger de moedas (ganho/gasto). |
| `rewards` / `reward_requests` | Loja Faixa Preta (prêmios) e pedidos. |
| `location_alerts` | Alertas de geolocalização suspeita. |
| `password_resets` | Tokens de reset de senha (TTL 1h). |
| `push_subscriptions` | Inscrições Web Push. |
| `google_tokens` | OAuth tokens (Google Calendar/Drive integration). |
| `job_justifications` | Motivos de atraso/cancelamento. |
| `system_config` | Chave/valor para flags de sistema. |
| `scheduler_sync_status` | Estado da última sincronização Holdprint. |

### 3.2 Relações críticas (simplificadas)

```
users (1) ───< (1) installers
users (1) ───< (N) password_resets
jobs  (1) ───< (N) item_checkins >─── (1) installers
item_checkins (1) ───< (N) item_pause_logs
item_checkins (1) ───< (N) installed_products
users (1) ───< (1) gamification_balances
users (1) ───< (N) coin_transactions
```

### 3.3 Convenções

- IDs: `TEXT` (UUID gerado na app com `uuid.uuid4()` ou `gen_random_uuid()::text` no SQL).
- Timestamps: `TIMESTAMPTZ DEFAULT NOW()`.
- Status de `jobs`: restrito por CHECK constraint — sempre usar valores validados em `backend/utils/status.py` (evita erro de CHECK constraint em produção).
- Colunas novas: **adicionar em `002_cleanup_and_fix.sql`** com `ADD COLUMN IF NOT EXISTS` — a app ignora colunas desconhecidas via registry central (ver [backend/db_supabase.py](backend/db_supabase.py)).

---

## 4. Backend

### 4.1 Tecnologia

- FastAPI 0.x + Uvicorn (via `@vercel/python`)
- Python 3.11
- Cliente Supabase: `supabase-py` (síncrono via `db_supabase.py`)
- Autenticação: JWT HS256 (secret = `SUPABASE_SERVICE_KEY`)
- Email: Resend

### 4.2 Estrutura

```
backend/
  api/
    index.py          # Entry point Vercel (exporta handler = app)
  server.py           # FastAPI app + CORS + routers + /health
  db_supabase.py      # Wrapper: db.users, db.jobs, etc. (Mongo-like)
  config.py           # Leitura de env vars + validações de boot
  security.py         # bcrypt, JWT create/verify, get_current_user
  routes/
    auth_new.py       # /api/auth/* (login, register, forgot/reset, self-register)
    users.py          # /api/users/*
    jobs.py           # /api/jobs/*
    checkins.py       # /api/checkins/*
    item_checkins.py  # /api/item-checkins/*  (fluxo principal)
    products.py       # /api/products/*
    reports.py        # /api/reports/*
    installers.py     # /api/installers/*
    gamification.py   # /api/gamification/*
    calendar.py       # /api/calendar/*  (Google Calendar)
    notifications.py  # /api/notifications/*  (Web Push)
  services/
    holdprint.py      # Cliente HTTP da Holdprint
    sync_holdprint.py # Sync batch diário (cron)
    gamification.py   # Regras de moedas/nível
    scheduler.py      # Scheduler sync
    gps.py            # Validação de coordenadas
    image.py          # Upload/processamento de fotos
    product_classifier.py
  models/             # Pydantic models
  migrations/         # SQL de schema (001, 002)
  init_admin.py       # Script CLI para criar admin inicial
  requirements.txt
  vercel.json         # routes + crons
```

### 4.3 Variáveis de ambiente (Vercel project `backend`)

| Variável | Valor / Descrição |
|---|---|
| `SUPABASE_URL` | `https://qfsxtwkltfraounsjjah.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `sb_secret_...` (secret, rotacionada) |
| `SUPABASE_ANON_KEY` | `sb_publishable_...` (publishable) |
| `FRONTEND_URL` | `https://instal-visual.com.br` (usada no link do email de reset) |
| `CORS_ORIGINS` | `https://instal-visual.com.br,https://www.instal-visual.com.br` |
| `RESEND_API_KEY` | `re_...` |
| `SENDER_EMAIL` | `bruno@industriavisual.com.br` (domínio precisa estar verificado no Resend) |
| `HOLDPRINT_API_KEY_POA` | chave da filial POA |
| `HOLDPRINT_API_KEY_SP` | chave da filial SP |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_CLAIMS_EMAIL` | Web Push |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth Google Calendar |
| `ENV` | `production` |
| `VERCEL` / `SERVERLESS` | `1` / `true` (flags internas) |

> ⚠️ **Sempre** valide o valor pasteando num editor antes de salvar no Vercel. Um `\n` no fim da string quebra algumas integrações. Hoje `REACT_APP_BACKEND_URL` e `SUPABASE_URL` do frontend têm `\n` no final, mas o browser strippa; mesmo assim, corrigir quando puder.

### 4.4 Endpoints principais

Prefixo: `/api`. Rotas públicas marcadas com 🟢, autenticadas 🔒.

Auth — [backend/routes/auth_new.py](backend/routes/auth_new.py):
- 🟢 `POST /api/auth/login` → JWT (7 dias)
- 🟢 `POST /api/auth/register` (self-register de installer)
- 🟢 `POST /api/auth/self-register` (alias)
- 🔒 `POST /api/auth/admin-register` (admin cria usuário)
- 🟢 `POST /api/auth/forgot-password` → envia email via Resend
- 🟢 `GET  /api/auth/verify-reset-token?token=...`
- 🟢 `POST /api/auth/reset-password`
- 🔒 `POST /api/auth/change-password`
- 🔒 `PUT  /api/auth/users/{user_id}/reset-password` (admin)

Outros routers: users, jobs, checkins, item-checkins, products, reports, calendar, notifications, gamification, installers.

Health (fora do prefixo): `GET /health` → 200 `{"status":"healthy",...}`.

### 4.5 Cron

Configurado em [backend/vercel.json](backend/vercel.json):
```json
{ "path": "/api/cron/sync-holdprint", "schedule": "0 6 * * *" }
```
06:00 UTC diário (03:00 BRT). Importa jobs da Holdprint para `jobs`. Sincronização manual: `POST /api/cron/sync-holdprint` com header `Authorization: Bearer <CRON_SECRET>`.

---

## 5. Frontend

### 5.1 Tecnologia

- React 18 + Create React App (com CRACO)
- Tailwind CSS + Shadcn/UI
- PWA (Service Worker, manifest.json)
- Axios para API
- PostHog para analytics

### 5.2 Estrutura

```
frontend/
  src/
    App.js                     # Rotas React Router
    pages/
      Login.jsx, Register.jsx, ForgotPassword.jsx, ResetPassword.jsx
      Dashboard.jsx            # Admin/Gerente
      InstallerDashboard.jsx   # Instalador
      Jobs.jsx, JobDetail.jsx, InstallerJobDetail.jsx
      Checkins.jsx, CheckinViewer.jsx
      Users.jsx, Profile.jsx, Installers (dentro de Users)
      Calendar.jsx, InstallerCalendar.jsx
      UnifiedReports.jsx, FamilyReport.jsx, FamilyKPIsReport.jsx,
      GamificationReport.jsx, InstallerReport.jsx
      LojaFaixaPreta.jsx       # Loja de recompensas
      SchedulerAdmin.jsx
    components/
      layout/Sidebar.jsx
      ui/                      # Shadcn primitives
      NotificationPermissionModal.jsx, UpdateNotification.jsx,
      BrowserCheck.jsx, CameraPermissionGuide.jsx,
      CoinAnimation.jsx, GamificationWidget.jsx, WeeklyLeaderboard.jsx
    context/AuthContext.jsx
    hooks/
    utils/
      api.js                   # Axios instance + endpoints
      tokenManager.js          # sessionStorage + sanitização XSS
  public/
    manifest.json, service-worker.js, icons...
  vercel.json                  # CRA build + SPA rewrites
```

### 5.3 Variáveis de ambiente (Vercel project `instalacao-seguranca`)

| Variável | Valor |
|---|---|
| `REACT_APP_BACKEND_URL` | `https://backend-henna-one-82.vercel.app` (atenção ao `\n`) |

CRA injeta `REACT_APP_*` apenas em **build time**. Mudanças exigem **Redeploy**.

### 5.4 Fluxo de autenticação

1. Usuário submete email/senha em `/login` → `api.login()` → `POST /api/auth/login`.
2. Response: `{ access_token, user }`. Token salvo em `sessionStorage` (não localStorage) via [frontend/src/utils/tokenManager.js](frontend/src/utils/tokenManager.js) — sanitização para XSS.
3. Axios interceptor adiciona `Authorization: Bearer <token>` em todas as chamadas.
4. Em 401, o frontend faz `logout()` e redireciona para `/login`.

### 5.5 Service Worker e PWA

- `public/service-worker.js` implementa cache offline + push.
- Atualizações: componente `UpdateNotification` detecta nova versão e pede reload.
- Notificações push: `NotificationPermissionModal` pede permissão → `api.subscribePush()` → `push_subscriptions` no DB.

---

## 6. Deploy

### 6.1 Vercel

- Projeto **backend** (`revs-projects-d261c528/backend`)
  - Source: repo GitHub (branch `main` = produção)
  - Build: `@vercel/python` via `vercel.json`
  - Alias: `backend-henna-one-82.vercel.app`
  - Deploy: push para `main` dispara build automático
- Projeto **instalacao-seguranca** (frontend)
  - Build: `craco build` → `build/`
  - Alias: `instal-visual.com.br`, `www.instal-visual.com.br`
  - Deploy: push para `main`

### 6.2 CLI

```bash
# Login + inspect
vercel login
vercel teams ls
vercel projects ls --scope=revs-projects-d261c528

# Para operar num projeto, primeiro linkar em um diretório:
mkdir /tmp/vercel_backend && cd /tmp/vercel_backend
vercel link --yes --project=backend --scope=revs-projects-d261c528

# Listar/editar envs
vercel env ls production
vercel env pull .env.prod --environment=production --yes
echo "valor_sem_newline" | vercel env add MINHA_VAR production
vercel env rm MINHA_VAR production --yes

# Deploys
vercel ls backend --scope=revs-projects-d261c528   # histórico
vercel promote <deploy-url>                         # rollback para deploy Ready
vercel --prod --yes                                 # novo deploy a partir do cwd (CUIDADO: deploya o CWD!)
```

> **Armadilha de deploy**: rodar `vercel --prod` de um diretório vazio (como o de link) sobe um deploy sem código → 404. Para disparar rebuild com novas envs sem rodar `vercel --prod`, use `vercel redeploy <url>` ou dispare um commit vazio no git.

### 6.3 DNS (Registro.br)

```
@      A      76.76.21.21
www    CNAME  cname.vercel-dns.com
```
> `api.instal-visual.com.br` **não** existe no DNS atualmente — o frontend fala direto com `backend-henna-one-82.vercel.app`. Se quiser usar o subdomínio oficial no futuro, configure o CNAME e adicione o domínio no projeto `backend` do Vercel.

---

## 7. Segurança

- Senhas: bcrypt via `passlib` (custo padrão 12).
- JWT HS256; secret = `SUPABASE_SERVICE_KEY`. Expiração 7 dias.
- CORS restrito em `CORS_ORIGINS`.
- HTTPS obrigatório (Vercel).
- `password_resets`: TTL 1h, token `secrets.token_urlsafe(32)`, deletado após uso.
- Tokens no **sessionStorage** (não persistem entre abas) + sanitização XSS.
- RLS hoje **desligado** — o backend é a única linha de defesa; nunca expor a `service_role` para o cliente.

---

## 8. Postmortem do incidente 14/04/2026

### 8.1 O que aconteceu
- ~13:49 UTC: alguém acionou **PITR** no Supabase do projeto `otyrrvkixegiqsthmaaj` e voltou o banco para antes da criação do schema → schema `public` vazio.
- ~13:51 UTC: uma migration automática (sugestão do Security Advisor) foi aplicada no projeto novo `qfsxtwkltfraounsjjah` ativando RLS + FORCE em **todas as tabelas** com apenas a policy `service_role_all`.
- Como o backend apontava (via `SUPABASE_URL`) para o projeto antigo vazio, login/register/forgot-password passaram a falhar — o backend buscava `users` em um banco sem a tabela.

### 8.2 Como foi identificado
- Playwright confirmou que a requisição chegava no backend e voltava 401 / 500.
- MCP Supabase apontava o banco conectado (`otyrrvkixegiqsthmaaj`) e a query `SELECT FROM users` retornou `relation does not exist`.
- `vercel env pull` mostrou que `SUPABASE_URL` do backend apontava para o projeto errado.

### 8.3 Correção aplicada
1. Trocadas 3 env vars do projeto Vercel `backend`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` para o projeto `qfsxtwkltfraounsjjah`.
2. Promovido o último deploy bom (`backend-j9x6b8b6d`) para produção (um `vercel --prod` de diretório vazio tinha subido um deploy quebrado).
3. Validação: `POST /api/auth/login` → 200; `POST /api/auth/register` → 200; `POST /api/auth/forgot-password` → `email_sent: true`.

### 8.4 Prevenção
- **Documentar em um lugar só** (este arquivo) qual é o projeto Supabase em produção.
- **Nunca** aceitar migrations automáticas do Security Advisor sem revisar — elas podem ativar RLS sem as policies necessárias.
- Antes de mexer em env var de produção, `vercel env pull` para snapshot e conferir valor atual.
- Antes de rodar PITR, fazer `pg_dump` lógico para fallback.
- Considerar manter **um único** projeto Supabase por ambiente — ter dois com nomes parecidos causa confusão.

---

## 9. Runbook — "não consigo logar"

Sequência de diagnóstico:

1. `curl https://backend-henna-one-82.vercel.app/health` → espera 200 `healthy`.
   - 404 ou 500 → redeploy via `vercel promote <last-good-url>`.
2. `curl -X POST .../api/auth/login -d '{"email":"...","password":"..."}'`
   - **401**: usuário não existe **no banco apontado**, ou senha errada. Ver item 3.
   - **500**: exception no backend. Ver Vercel Logs: `vercel logs backend --scope=revs-projects-d261c528`.
   - **422**: payload inválido (normalmente email sem `@`).
3. `vercel env pull` no projeto `backend` e confirmar `SUPABASE_URL=https://qfsxtwkltfraounsjjah.supabase.co`.
   - Se apontar para `otyrrvkixegiqsthmaaj` ou qualquer outro: trocar (ver §8.3).
4. No SQL Editor do projeto certo: `SELECT email, is_active, length(password_hash) FROM users WHERE email = '...';`
   - Sem linha → usuário realmente não existe. Criar via `init_admin.py` (admin) ou `/api/auth/register` (installer).
   - `is_active = false` → reativar.
   - `hash_len != 60` → hash corrompido. Resetar com `UPDATE users SET password_hash = '<novo bcrypt>' WHERE email = '...';`.
5. Verificar RLS: `SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname='public' AND (rowsecurity OR forcerowsecurity);`
   - Se retornar linhas e o backend não tiver `service_role` correta, todos os SELECTs voltam vazios e login "cai em 401 fantasma".
   - Fix: garantir que `SUPABASE_SERVICE_KEY` é a secret do projeto atual; em último caso, `DISABLE ROW LEVEL SECURITY` (ver §2.2).
6. Testar frontend com browser → DevTools → Network e confirmar que o POST vai para a URL correta **sem** `%0A` (newline URL-encoded).

---

## 10. Runbook — "forgot-password não envia email"

1. `curl -X POST .../api/auth/forgot-password -d '{"email":"..."}'` → deve retornar `email_sent: true`.
   - Se vier `email_sent: false` e nada mais: `RESEND_API_KEY` ausente no backend Vercel.
   - Se vier `error_type: "test_mode"`: domínio não verificado no Resend. Ir em resend.com → Domains e verificar SPF/DKIM.
2. Logs do backend para ver texto da exception: `Failed to send reset email: ...`.
3. Email chegou mas link não abre: conferir `FRONTEND_URL=https://instal-visual.com.br` no backend.

---

## 11. Runbook — "criar conta dá erro"

1. Testar direto: `curl -X POST .../api/auth/register -d '{"name":"X","email":"y@z.com","password":"123456"}'`.
   - **500 + log "relation ... does not exist"** → backend apontando para projeto sem schema (incidente 14/04). Aplicar §8.3.
   - **500 + log "new row violates ... RLS"** → RLS ligado com policies erradas. Aplicar §2.2.
   - **400 "email já cadastrado"** → comportamento correto.

---

## 12. Operações comuns

### Criar admin inicial (após banco limpo)
```bash
cd backend
SUPABASE_URL=https://qfsxtwkltfraounsjjah.supabase.co \
SUPABASE_SERVICE_KEY=sb_secret_... \
python init_admin.py
```
> Script skippa se já existir — usar um UPDATE direto para trocar senha de admin já criado.

### Resetar senha de um usuário via SQL
Gerar hash localmente:
```python
from passlib.context import CryptContext
ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
print(ctx.hash("novaSenha"))
```
Depois:
```sql
UPDATE users SET password_hash = '$2b$12$...' , is_active = true WHERE email = '...';
```

### Rotacionar chaves Supabase
1. Supabase dashboard → Settings → API Keys → Reset em `service_role` e `publishable` do projeto `qfsxtwkltfraounsjjah`.
2. `cd /tmp/vercel_backend && vercel env rm SUPABASE_SERVICE_KEY production --yes && echo "sb_secret_nova..." | vercel env add SUPABASE_SERVICE_KEY production` (idem anon).
3. `vercel redeploy <ultimo-deploy-url>` ou commit vazio para forçar rebuild com novas envs.
4. Repetir no projeto `instalacao-seguranca` se tiver as mesmas envs lá (hoje tem — mas o frontend não usa service key; apenas o backend usa).

### Sincronizar Holdprint manualmente
```bash
curl -X POST https://backend-henna-one-82.vercel.app/api/cron/sync-holdprint \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Ver logs do backend
```bash
cd /tmp/vercel_backend
vercel logs backend --scope=revs-projects-d261c528
# Ou pelo dashboard: Vercel → backend → Functions → Logs
```

### Backup lógico do banco
```bash
pg_dump "postgres://postgres:<senha>@db.qfsxtwkltfraounsjjah.supabase.co:5432/postgres" \
  --no-owner --no-acl -f backup_$(date +%Y%m%d).sql
```
Pegar a connection string em Supabase → Project Settings → Database.

---

## 13. Gamificação — regras

| Ação | % do total de moedas do job |
|---|---|
| Check-in no prazo | 50% |
| Foto no check-out | 20% |
| Primeiro acesso do dia | 10% |
| Produtividade base | 20% |

Conversão base: **1 m² = 10 moedas**. Ajustes por nível de dificuldade e cenário aplicados em `services/gamification.py`.

| Nível | Moedas |
|---|---|
| Bronze | 0–499 |
| Prata | 500–1.999 |
| Ouro | 2.000–4.999 |
| Faixa Preta | 5.000+ |

---

## 14. Contatos e recursos

- Dashboard Vercel: https://vercel.com/revs-projects
- Dashboard Supabase: https://supabase.com/dashboard/project/qfsxtwkltfraounsjjah
- Resend: https://resend.com (verificar domínio `industriavisual.com.br`)
- Holdprint API: docs internas (chaves em env)
- Repo: GitHub (branch `main` = produção)

---

*Este arquivo é a referência oficial. Ao alterar a infra, atualize aqui antes de encerrar a task.*
