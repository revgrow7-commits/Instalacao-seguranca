# UX e Fluxos — Indústria Visual

## Fluxo do instalador (mobile-first)

O instalador usa exclusivamente o celular. O app é um PWA com `InstallerLayout` (sem sidebar, apenas BottomNav).

```
1. LOGIN
   /login → POST /api/auth/login → JWT salvo em localStorage
   └── redireciona para /installer/dashboard

2. DASHBOARD DO INSTALADOR
   /installer/dashboard (InstallerDashboard.jsx)
   └── lista jobs do dia atribuídos ao instalador logado
   └── mostra status de cada job (aguardando, em andamento, concluído)

3. VER DETALHES DO JOB
   /installer/job/:jobId (InstallerJobDetail.jsx)
   └── GET /api/jobs/{id}
   └── lista os itens do job com status individual de check-in
   └── botão "Iniciar" por item

4. CHECK-IN POR ITEM
   Toque em "Iniciar" no item
   └── câmera abre para foto de entrada
   └── GPS capturado automaticamente
   └── POST /api/item-checkins → {job_id, item_index, checkin_photo (base64), gps_lat, gps_long}
   └── status do item passa para "in_progress"
   └── timer começa a contar

5. PAUSA (opcional)
   POST /api/item-checkins/{id}/pause → {reason}
   └── timer pausado; pausa gravada em item_pause_logs
   POST /api/item-checkins/{id}/resume
   └── timer retomado

6. CHECKOUT POR ITEM
   Toque em "Finalizar" no item
   └── câmera abre para foto de saída
   └── GPS capturado
   └── PUT /api/item-checkins/{id}/checkout → {checkout_photo, checkout_gps_lat, checkout_gps_long, installed_m2}
   └── backend calcula net_duration_minutes (total - pausas) e productivity_m2_h
   └── se GPS de saída > 500m do job: alerta gravado em location_alerts

7. JOB CONCLUÍDO
   Quando todos os itens têm checkout, gestor finaliza o job:
   POST /api/jobs/{id}/finalize
   └── status do job passa para "concluído"

8. AGENDA DO INSTALADOR
   /installer/calendar (InstallerCalendar.jsx)
   └── GET /api/jobs/team-calendar
   └── visão mensal dos jobs agendados para o instalador logado
```

---

## Fluxo do gestor (admin / manager)

O gestor usa desktop (sidebar) ou mobile (BottomNav com itens de admin).

```
1. LOGIN
   /login → redireciona para /dashboard

2. DASHBOARD
   /dashboard (Dashboard.jsx)
   └── resumo: jobs por status, check-ins do dia, alertas GPS recentes
   └── cards de ação rápida: importar, agendar

3. IMPORTAR JOBS DO HOLDPRINT
   /jobs → botão "Sincronizar Holdprint"
   └── POST /api/jobs/sync-holdprint
   └── novos jobs aparecem com status "aguardando"

4. AGENDAR E ATRIBUIR
   /jobs → selecionar job → JobDetail.jsx → /jobs/:id
   └── PUT /api/jobs/{id}/schedule → {scheduled_date}
   └── PUT /api/jobs/{id}/assign → {installer_ids}
   └── também possível via SchedulerAdmin: /admin/scheduler

5. ACOMPANHAR CHECK-INS
   /checkins (Checkins.jsx)
   └── GET /api/checkins — check-ins ativos do dia
   └── GET /api/item-checkins/all — check-ins por item com status detalhado
   └── clique abre CheckinViewer: /checkin-viewer/:id

6. VISITAS TÉCNICAS
   /visitas-tecnicas (VisitasTecnicas.jsx)
   └── POST /api/visitas — criar VT
   └── POST /api/visitas/{id}/agendar — definir data e responsável
   └── POST /api/visitas/{id}/confirmar / rejeitar / cancelar
   └── POST /api/visitas/{id}/relatorio — anexar relatório com fotos
   └── POST /api/visitas/{id}/enviar-email — enviar relatório ao cliente (Resend)

7. RELATÓRIOS
   /reports (UnifiedReports.jsx) — produtividade consolidada por período
   /reports/family (FamilyReport.jsx) — por família de produto
   /reports/installer (InstallerReport.jsx) — por instalador
   /reports/kpis (FamilyKPIsReport.jsx) — KPIs de produtividade por família
   └── GET /api/reports/by-family
   └── GET /api/reports/by-installer
   └── GET /api/reports/kpis/family-productivity
   └── GET /api/reports/export (CSV/Excel)

8. ALERTAS GPS
   Dashboard → seção "Alertas de localização"
   └── GET /api/location-alerts — alertas das últimas 24h
```

---

## Estrutura de telas

| Página (arquivo) | Rota | Quem acessa | Layout |
|---|---|---|---|
| `Login.jsx` | `/login` | todos (não autenticados) | sem layout |
| `Register.jsx` | `/register` | todos (não autenticados) | sem layout |
| `ForgotPassword.jsx` | `/forgot-password` | todos | sem layout |
| `ResetPassword.jsx` | `/reset-password` | todos | sem layout |
| `Dashboard.jsx` | `/dashboard` | admin, manager, installer | MainLayout |
| `InstallerDashboard.jsx` | `/installer/dashboard` | installer | InstallerLayout |
| `InstallerJobDetail.jsx` | `/installer/job/:jobId` | installer | sem layout (próprio) |
| `InstallerCalendar.jsx` | `/installer/calendar` | installer | InstallerLayout |
| `Jobs.jsx` | `/jobs` | todos (com filtros por role) | MainLayout |
| `JobDetail.jsx` | `/jobs/:jobId` | admin, manager (installer é redirecionado para InstallerJobDetail) | MainLayout |
| `Checkins.jsx` | `/checkins` | admin, manager | MainLayout |
| `CheckinViewer.jsx` | `/checkin-viewer/:checkinId` | todos | MainLayout |
| `Calendar.jsx` | `/calendar` | admin, manager | MainLayout |
| `VisitasTecnicas.jsx` | `/visitas-tecnicas` | admin, manager, installer | MainLayout |
| `VisitaDetail.jsx` | `/visitas-tecnicas/:id` | admin, manager, installer | MainLayout |
| `VisitasRelatorios.jsx` | `/visitas-tecnicas/relatorios` | admin, manager | MainLayout |
| `UnifiedReports.jsx` | `/reports` | todos (com filtros por role) | MainLayout |
| `FamilyReport.jsx` | `/reports/family` | admin, manager | MainLayout |
| `InstallerReport.jsx` | `/reports/installer` | admin, manager | MainLayout |
| `FamilyKPIsReport.jsx` | `/reports/kpis` | admin, manager | MainLayout |
| `Users.jsx` | `/users` | admin, manager | MainLayout |
| `SchedulerAdmin.jsx` | `/admin/scheduler` | admin, manager | MainLayout |
| `Profile.jsx` | `/profile` | todos | MainLayout |

> Rotas `/loja-faixa-preta` e `/gamification-report` redirecionam para `/dashboard` (gamificação desabilitada desde 2026-05-15).

---

## Navegação

### Sidebar — desktop (md: e acima)
Componente `Sidebar.jsx` — visível apenas em telas >= md. Items filtrados por `user.role`:

| Item | Ícone | Visível para |
|---|---|---|
| Dashboard | LayoutDashboard | admin, manager, installer |
| Jobs | Briefcase | admin, manager, installer |
| Visitas Técnicas | MapPin | admin, manager, installer |
| Check-ins | CheckCircle | admin, manager |
| Relatórios | BarChart3 | admin, manager |
| KPIs Família | TrendingUp | admin, manager |
| Calendário | Calendar | admin, manager |
| Usuários | Users | admin |
| Agendamentos | Settings | admin, manager |

Rodapé da sidebar: avatar do usuário logado com nome e role, botão de logout.

### BottomNav — mobile (abaixo de md)
Componente `BottomNav.jsx` — fixado na parte inferior da tela. Items filtrados por role:

| Item | Ícone | Role |
|---|---|---|
| Dashboard | LayoutDashboard | admin, manager → `/dashboard` |
| Dashboard | LayoutDashboard | installer → `/installer/dashboard` |
| Jobs | Briefcase | admin, manager |
| Visitas | MapPin | admin, manager |
| Calendário | Calendar | installer → `/installer/calendar` |
| Calendário | Calendar | admin, manager → `/calendar` |
| Perfil | User | todos → `/profile` |

O BottomNav tem padding-bottom com `env(safe-area-inset-bottom)` para respeitar o notch e a home indicator do iPhone.

### Layouts de aplicação

**MainLayout** — usado por gestores e páginas compartilhadas:
- Sidebar fixa na esquerda (desktop)
- Conteúdo principal com `pb-20` no mobile para não sobrepor o BottomNav
- Lazy loading das páginas com fallback `PageLoader` (spinner)

**InstallerLayout** — usado pelas telas exclusivas do instalador:
- Sem sidebar (layout mais limpo para celular)
- Apenas BottomNav na parte inferior
- Otimizado para telas pequenas

---

## Componentes-chave reutilizados

| Componente | Local | Uso |
|---|---|---|
| `AuthContext.jsx` | `context/` | Provedor de autenticação global: `user`, `login()`, `logout()`, `isAdmin`, `isManager`, `isInstaller` |
| `api.js` | `utils/` | Wrapper Axios com baseURL, interceptor de JWT no header, interceptor 401 → logout, cache simples por URL |
| `tokenManager.js` | `utils/` | Leitura/escrita do JWT no localStorage com TTL de 7 dias e snapshot de usuário em sessionStorage (TTL 5min) |
| `useJobs.js` | `hooks/` | Hook para listar, buscar e atualizar jobs via Axios |
| `useVisitas.js` | `hooks/` | Hook para CRUD de visitas técnicas |
| `useCatalogos.js` | `hooks/` | Hook para vendedores, tipos de serviço e ferramentas VT |
| `usePushNotifications.js` | `hooks/` | Assinar/cancelar push notifications VAPID |
| `UpdateNotification.jsx` | `components/` | Banner de atualização do Service Worker quando nova versão está disponível |
| `OfflineBanner` | `App.js` (inline) | Banner de "Sem conexão" com debounce de 4s para evitar falso positivo ao trocar de rede |
| `ErrorBoundary` | `App.js` (inline) | Captura ChunkLoadError (falha de rede no lazy load) — tenta soft reload automático antes de mostrar tela de erro |
