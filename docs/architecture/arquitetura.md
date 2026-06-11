# Arquitetura — Indústria Visual

## Visão geral

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERCEL (CDN global)                      │
│                                                                   │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐  │
│  │   Frontend (CRA SPA)    │   │  Backend (FastAPI serverless) │  │
│  │   React 18 / JavaScript │   │  Python 3.x                  │  │
│  │   Rota: /               │   │  Rota: /_/backend/api/*      │  │
│  │   PWA + Service Worker  │   │  Timeout: 60s (Vercel limit)  │  │
│  └─────────────────────────┘   └──────────────────────────────┘  │
│             |                               |                     │
└─────────────┼───────────────────────────────┼─────────────────────┘
              |                               |
              |          ┌────────────────────┘
              |          |
              v          v
     ┌──────────────────────────────┐
     │        Supabase              │
     │  PostgreSQL (PostgREST)      │
     │  Storage (bucket: checkin-   │
     │            photos)           │
     │  Projeto: qfsxtwkltfraounsjjah│
     └──────────────────────────────┘

Integrações externas:
  Holdprint API   <──  backend (sync cron + sync manual)
  Google Calendar <──  backend (OAuth 2.0, calendar.py)
  Resend (email)  <──  backend (reset de senha, relatório VT)
  Web Push VAPID  <──  backend → browser do instalador
```

---

## Deploy e roteamento

O monorepo usa `vercel.json` para separar frontend e backend no mesmo domínio:

- `instal-visual.com.br/*` → frontend CRA (SPA — index.html para qualquer path)
- `instal-visual.com.br/_/backend/api/*` → FastAPI (função serverless Python)

A env `REACT_APP_BACKEND_URL` deve apontar para `https://instal-visual.com.br/_/backend` (sem `/api` — o prefixo `/api` é adicionado pelo wrapper `utils/api.js`).

---

## Módulos do backend (routers FastAPI)

| Arquivo | Prefixo | Endpoints principais |
|---|---|---|
| `routes/auth_new.py` | `/api/auth` | `POST /login`, `POST /register`, `POST /forgot-password`, `POST /reset-password`, `POST /change-password`, `GET /me` |
| `routes/users.py` | `/api/users` | CRUD de usuários, reset de senha pelo admin |
| `routes/jobs.py` | `/api/jobs` | `GET /jobs`, `POST /jobs`, `PUT /jobs/{id}`, `PUT /jobs/{id}/schedule`, `PUT /jobs/{id}/assign`, `POST /jobs/{id}/finalize`, `POST /jobs/sync-holdprint`, `GET /jobs/team-calendar` |
| `routes/checkins.py` | `/api/checkins` | `POST /checkins` (check-in), `PUT /checkins/{id}/checkout`, `GET /checkins` |
| `routes/item_checkins.py` | `/api/item-checkins` | `POST /item-checkins` (check-in por item), `PUT /item-checkins/{id}/checkout`, `POST /item-checkins/{id}/pause`, `POST /item-checkins/{id}/resume`, `GET /item-checkins/all` |
| `routes/installers.py` | `/api/installers` | CRUD instaladores, alertas GPS |
| `routes/visitas.py` | `/api/visitas` | `POST /visitas`, `GET /visitas`, `GET /visitas/{id}`, `PATCH /visitas/{id}`, `POST /visitas/{id}/agendar`, `POST /visitas/{id}/confirmar`, `POST /visitas/{id}/rejeitar`, `POST /visitas/{id}/cancelar`, `POST /visitas/{id}/relatorio`, `POST /visitas/{id}/enviar-email` |
| `routes/visitas_reports.py` | `/api/visitas/reports` | Relatórios de visitas técnicas + export Excel |
| `routes/catalogos.py` | `/api/catalogos` | Vendedores, tipos de serviço VT, ferramentas VT |
| `routes/reports.py` | `/api/reports` | `GET /reports/by-family`, `GET /reports/by-installer`, `GET /reports/kpis/family-productivity`, `GET /reports/export`, `GET /metrics` |
| `routes/products.py` | `/api/products` | Catálogo de produtos e famílias de produto |
| `routes/calendar.py` | `/api/calendar` | `GET /calendar/events`, OAuth Google Calendar |
| `routes/notifications.py` | `/api/notifications` | Assinar/cancelar push VAPID, enviar notificação |
| `routes/integration.py` | `/api/integration` | Sync manual Holdprint |
| `routes/cs_integration.py` | `/api/cs` | Integração CS (visitas técnicas) |
| `routes/job_photos.py` | `/api/job-photos` | Upload e gestão de fotos de job |
| `server.py` (inline) | `/api/admin`, `/api/scheduler`, `/api/cron`, `/api/location-alerts` | Cleanup dev, status do scheduler, cron Holdprint, alertas GPS últimas 24h |

---

## Tabelas principais do banco (PostgreSQL / Supabase)

| Tabela | Propósito |
|---|---|
| `users` | Contas de acesso: admin, manager, installer. Campos: `id`, `email`, `name`, `role`, `branch`, `is_active` |
| `installers` | Perfil do instalador em campo: `full_name`, `branch`, `total_jobs`, `total_area_installed`. Vinculado a `users.id` |
| `product_families` | Categorias de produto (ex: "Adesivo Vinílico", "Lona", "ACM"). Usadas para agrupamento em relatórios |
| `jobs` | Ordens de serviço. Campos: `holdprint_job_id`, `title`, `client_name`, `client_address`, `status`, `branch`, `items` (JSONB), `assigned_installers` (JSONB), `scheduled_date`, `products_with_area` (JSONB) |
| `checkins` | Check-in a nível de job (legado). Campos: `job_id`, `installer_id`, `checkin_at`, `checkout_at`, `checkin_photo`, `checkout_photo`, `gps_lat/long`, `checkout_gps_lat/long` |
| `item_checkins` | Check-in por item do job (modelo atual). Registra `item_index`, tempo líquido (`net_duration_minutes`), área instalada (`installed_m2`), produtividade (`productivity_m2_h`), pausas |
| `item_pause_logs` | Log de pausas durante execução de um item. Campos: `checkin_id`, `reason`, `paused_at`, `resumed_at`, `duration_minutes` |
| `installed_products` | Registro desnormalizado de cada produto instalado: família, área, dimensões, produtividade |
| `productivity_history` | Benchmarks históricos de produtividade por família e por instalador |
| `location_alerts` | Checkouts fora do raio GPS permitido (500m padrão). Campos: `distance_meters`, `event_type`, `action_taken` |
| `visitas_tecnicas` | Visitas técnicas pré-instalação: ciclo de status (`rascunho` → `agendada` → `confirmada` → `realizada`) |
| `password_resets` | Tokens de reset de senha com expiração |
| `push_subscriptions` | Subscriptions VAPID para Web Push por usuário |
| `google_tokens` | Tokens OAuth do Google Calendar por usuário |
| `job_justifications` | Justificativas para jobs cancelados, excluídos de métricas ou sem instalação |
| `system_config` | Config chave-valor: última sincronização Holdprint, etc. |
| `scheduler_sync_status` | Status e contadores de cada tipo de sincronização |

> Tabelas de gamificação (`gamification_balances`, `coin_transactions`, `rewards`, `reward_requests`) existem no banco mas a funcionalidade está desabilitada desde 2026-05-15.

---

## Autenticação e permissões

### Mecanismo
- JWT HS256, expiração de **7 dias**, secret em `JWT_SECRET` (env).
- Token armazenado em `localStorage` via `tokenManager.js`.
- `AuthContext` faz refresh de perfil via `GET /api/auth/me` no boot; captura 401 e faz logout automático.

### Roles

```
admin    — acesso total: CRUD de usuários, configurações, todos os relatórios, agendamentos
manager  — acesso operacional: jobs, checkins, calendário, relatórios, visitas técnicas
installer — acesso restrito: própria agenda, check-in/checkout dos jobs atribuídos, visitas técnicas (leitura)
```

### Onde as permissões são aplicadas

- **Backend:** toda rota protegida usa `Depends(get_current_user)` (FastAPI dependency injection). Ações admin/manager usam `require_role(user, [UserRole.ADMIN])` antes de executar. Lança HTTP 403 se role insuficiente.
- **Frontend:** `ProtectedRoute` em `App.js` verifica `user.role` contra `allowedRoles`. Redirecionamentos na navegação (Sidebar e BottomNav) filtram itens pelo role do usuário logado.

---

## Integrações

### Holdprint (ERP)
- **Cron diário:** `GET /api/cron/sync-holdprint` às 09:00 UTC (06:00 BRT), autenticado com `CRON_SECRET` via header `Authorization: Bearer`.
- **Sync manual:** `POST /api/jobs/sync-holdprint` e `POST /api/integration/sync` (disponível para admin/manager).
- Duas filiais: `HOLDPRINT_API_KEY_POA` (Porto Alegre) e `HOLDPRINT_API_KEY_SP` (São Paulo).
- Jobs importados com `holdprint_job_id` único para evitar duplicatas.

### Google Calendar (OAuth 2.0)
- Rota `GET /api/calendar/auth-url` inicia o fluxo OAuth.
- Callback em `GET /api/calendar/callback` — valida `state` HMAC antes do exchange do code (prevenção CSRF).
- Token armazenado em `google_tokens` por usuário.

### Resend (email transacional)
- Reset de senha: link com token para `POST /api/auth/reset-password`.
- Envio de relatório de visita técnica para o cliente: `POST /api/visitas/{id}/enviar-email`.

### Web Push (VAPID)
- Chaves `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` configuradas na Vercel.
- Instalador assina notificações via `POST /api/notifications/subscribe`.
- Backend envia push via `py-vapid` quando job é agendado ou atualizado.

---

## Camada de banco (`db_supabase.py`)

O backend usa uma abstração MongoDB-like sobre o Supabase PostgREST:

```python
db.jobs.find({"status": "aguardando"})          # SELECT WHERE
db.jobs.find_one({"id": job_id})                 # SELECT ... LIMIT 1
db.jobs.insert_one({...})                         # INSERT
db.jobs.update_one({"id": job_id}, {"$set": {..}}) # UPDATE
db.jobs.update_one({"id": job_id}, {"$inc": {"total_jobs": 1}})  # atômico via RPC
```

Antes de qualquer insert/update, `_filter_columns()` remove campos não registrados em `TABLE_COLUMNS`. Se adicionar coluna no banco via migration, adicionar também no registry `TABLE_COLUMNS` em `db_supabase.py`.

---

## Pontos de escalabilidade e limites conhecidos

| Ponto | Limite atual | Impacto | Caminho de resolução |
|---|---|---|---|
| Timeout serverless Vercel | 60s (plano Hobby/Pro) | Sync Holdprint com muitos jobs pode estourar | Migrar sync para background job ou Supabase Edge Function |
| `find()` sem paginação em reports | Retorna todos os registros — sem LIMIT | Reports lentos conforme volume cresce | Paginação já implementada no backend (opt-in com `?page=&page_size=`); frontend ainda não adota |
| Fotos como base64 no banco (legado) | Fotos antigas armazenadas como base64 em `checkins.checkin_photo` | Registros grandes, queries lentas | Migrar para Supabase Storage; fallback base64 ainda funciona |
| `$inc` sem migration 039 | Fallback read-then-write (race condition sob carga concorrente) | Contadores podem perder incrementos | Aplicar `039_increment_field_atomic.sql` no Supabase |
| CORS wildcard | `allow_origins="*"` (default) | Risco de segurança em produção | Setar env `CORS_ORIGINS` com domínio específico |
