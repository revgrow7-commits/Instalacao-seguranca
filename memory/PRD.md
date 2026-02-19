# PRD - Sistema de Controle de Produtividade de Instaladores

## Descrição do Projeto
Sistema PWA para controlar a produtividade de instaladores da Indústria Visual. Inclui autenticação, integração com a API da Holdworks, funcionalidades de check-in/out, painel de gerenciamento, relatórios e sistema de gamificação.

## Stack Tecnológico
- **Frontend:** React + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI (Python)
- **Banco de Dados:** MongoDB
- **Integrações:** Holdworks API, Google Calendar, Resend, Web Push Notifications

---

## Funcionalidades Implementadas

### Autenticação e Usuários
- [x] Login JWT com diferentes perfis (Admin, Gerente, Instalador)
- [x] Recuperação de senha (com Resend - bloqueado aguardando verificação de domínio)
- [x] Gerenciamento de usuários (busca, filtros, edição, ativação/desativação)

### Jobs e Importação
- [x] Integração com API Holdworks para importar jobs
- [x] Atribuição de itens a instaladores
- [x] Agendamento com verificação de conflitos

### Check-in/Check-out
- [x] Check-in por item com foto e GPS
- [x] Check-out com validação de evidências
- [x] Sistema de pausas com motivos
- [x] Geofencing (alerta se checkout > 500m do local)
- [x] Cálculo de produtividade (m²/h)

### Calendário
- [x] Drag-and-drop para agendamento
- [x] Calendário da equipe para instaladores (read-only)
- [x] **Nome do job exibido no calendário** (ao invés de apenas código)
- [x] **Visualização de todos os jobs da equipe** com destaque para "Meus Jobs"
- [x] Integração Google Calendar (bloqueado - configuração pendente)

### Relatórios
- [x] Relatório unificado com filtros (período, instalador, família de produto)
- [x] Exportação para Excel
- [x] Classificação automática de produtos por família

### Sistema de Gamificação (NOVO - 09/01/2026)
- [x] **Lógica de Pontuação (4 gatilhos):**
  - Check-in no Prazo (50%): Se check-in <= horário agendado
  - Check-out com Evidências (20%): Se foto de checkout foi enviada
  - Engajamento na Agenda (10%): Bônus diário ao acessar o app
  - Produtividade Base (20%): Por conclusão do item em m²
- [x] **Conversão:** 1 m² com 100% = 10 moedas
- [x] **Níveis de Progressão:**
  - 🥉 Bronze (0-500 moedas)
  - 🥈 Prata (501-2000 moedas)
  - 🥇 Ouro (2001-5000 moedas)
  - 🥋 Faixa Preta (5001+ moedas)
- [x] **Loja Faixa Preta:** Prêmios resgatáveis com moedas
- [x] **Relatório de Bonificação:** Apuração mensal para gerentes/admins
- [x] **Toast de Notificação:** Feedback imediato ao ganhar moedas
- [x] **Widget no Dashboard:** Saldo, nível, progresso, ganhos recentes
- [x] **Ranking Semanal:** Leaderboard visível para todos os instaladores
- [x] **Animação de Chuva de Moedas:** Efeito visual após checkout com contador animado

### Notificações
- [x] Infraestrutura de Push Notifications (VAPID)
- [x] Sistema de justificativa para jobs não realizados

---

## Integrações de Terceiros

| Integração | Status | Observação |
|------------|--------|------------|
| Trello API | ✅ Funcional | Integração PCP finalizada |
| Holdworks API | ✅ Funcional | Importação de jobs |
| Google Maps | ✅ Funcional | Links de localização |
| openpyxl | ✅ Funcional | Exportação Excel |
| Google Calendar | ⚠️ Bloqueado | Aguarda config no Google Cloud |
| Resend | ⚠️ Bloqueado | Aguarda verificação de domínio |
| Web Push | ✅ Implementado | Requer teste e2e |

---

## Arquitetura de Arquivos

```
/app/
├── backend/
│   ├── server.py              # API principal (~5040 linhas, em refatoração)
│   ├── config.py              # Configurações e constantes
│   ├── database.py            # Conexão MongoDB
│   ├── security.py            # Autenticação JWT
│   ├── models/                # Modelos Pydantic
│   │   ├── __init__.py
│   │   ├── user.py            # User, UserCreate, Token
│   │   ├── job.py             # Job, JobCreate, JobSchedule
│   │   ├── checkin.py         # CheckIn, ItemCheckin
│   │   ├── product.py         # ProductFamily, ProductInstalled
│   │   ├── gamification.py    # GamificationBalance, Reward
│   │   └── notification.py    # PushSubscription
│   ├── services/              # Lógica de negócios
│   │   ├── __init__.py
│   │   ├── product_classifier.py  # Classificação de produtos
│   │   ├── holdprint.py           # Integração Holdprint
│   │   ├── gamification.py        # Cálculo de moedas
│   │   ├── image.py               # Compressão de imagens
│   │   └── gps.py                 # Cálculo de distâncias
│   ├── routes/                # Rotas da API (migração em progresso)
│   │   ├── __init__.py        # Registro de todos os routers
│   │   ├── auth.py            # ✅ MIGRADO: Autenticação
│   │   ├── checkins.py        # ✅ MIGRADO: Check-ins legado
│   │   ├── item_checkins.py   # ✅ MIGRADO: Item check-ins (fluxo moderno)
│   │   ├── gamification.py    # ✅ MIGRADO: Gamificação completa
│   │   ├── users.py           # Stub (pendente migração)
│   │   ├── jobs.py            # Stub (pendente migração)
│   │   └── ...
│   └── .env                   # Credenciais
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── InstallerDashboard.jsx   # Com gamificação
│   │   │   ├── LojaFaixaPreta.jsx       # NOVO
│   │   │   ├── GamificationReport.jsx   # NOVO
│   │   │   ├── Jobs.jsx
│   │   │   ├── JobDetail.jsx
│   │   │   ├── Users.jsx
│   │   │   ├── UnifiedReports.jsx
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── CoinAnimation.jsx        # NOVO
│   │   │   ├── GamificationWidget.jsx   # NOVO
│   │   │   └── ...
│   │   └── utils/
│   │       └── api.js                   # Endpoints da API
│   └── .env
└── memory/
    └── PRD.md
```

---

## Coleções MongoDB

- `users` - Usuários do sistema
- `installers` - Perfis de instaladores
- `jobs` - Jobs importados/criados
- `item_checkins` - Check-ins por item
- `item_pause_logs` - Logs de pausas
- `location_alerts` - Alertas de geofencing
- `installed_products` - Produtos instalados
- `gamification_balances` - Saldo de moedas dos usuários (NOVO)
- `coin_transactions` - Histórico de transações (NOVO)
- `rewards` - Prêmios disponíveis (NOVO)
- `reward_requests` - Solicitações de resgate (NOVO)

---

## Endpoints de Gamificação (NOVOS)

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/gamification/balance` | GET | Saldo do usuário atual |
| `/api/gamification/balance/{user_id}` | GET | Saldo de usuário específico |
| `/api/gamification/transactions` | GET | Histórico de transações |
| `/api/gamification/daily-engagement` | POST | Registrar bônus diário |
| `/api/gamification/rewards` | GET | Listar prêmios |
| `/api/gamification/rewards/seed` | POST | Criar prêmios padrão |
| `/api/gamification/redeem/{reward_id}` | POST | Resgatar prêmio |
| `/api/gamification/redemptions` | GET | Meus resgates |
| `/api/gamification/report` | GET | Relatório mensal |
| `/api/gamification/leaderboard` | GET | Ranking |

---

## Credenciais de Teste

| Perfil | Email | Senha |
|--------|-------|-------|
| Admin | admin@industriavisual.com | admin123 |
| Gerente | gerente@industriavisual.com | gerente123 |
| Instalador | bruno@industriavisual.ind.br | bruno123 |

---

## Backlog / Próximas Tarefas

### P1 - Alta Prioridade
- [ ] Continuar migração de rotas (jobs, users, checkins) para arquivos separados
- [ ] Gerenciamento de prêmios pelo admin na interface
- [ ] Testar gatilhos de notificação push de ponta a ponta

### P2 - Média Prioridade
- [ ] Sistema manual de classificação de produtos por família

### P3 - Baixa Prioridade
- [ ] Capacidades Offline (PWA)
- [ ] Machine Learning para calibrar matriz de tempo

---

## Issues Conhecidos

1. **Google Calendar (Bloqueado):** Erro 403 - requer configuração de URIs no Google Cloud Console pelo usuário
2. **Resend Email (Bloqueado):** Modo de teste - requer verificação do domínio `industriavisual.com.br`

---

## Changelog

### 19/02/2026 - Refatoração Continuada do Backend
- ✅ **REFATORAÇÃO:** Migradas rotas de Item-Checkins para módulo separado
  - Criado `/app/backend/routes/item_checkins.py` (~700 linhas)
  - Rotas migradas: POST/GET/PUT/DELETE `/item-checkins/*`, `/pause-reasons`
  - `server.py` reduzido de 5485 para 4867 linhas (~11% de redução)
- ✅ **BUGFIX:** Adicionada opção "Agendado" no filtro de status da página Jobs

### 18/02/2026 - Refatoração, Correções e Testes E2E
- ✅ **BUGFIX:** Corrigido erro `UnboundLocalError` no endpoint `/api/reports/productivity`
- ✅ **BUGFIX:** Restaurada função `detect_product_family` removida acidentalmente
- ✅ **BUGFIX:** Adicionada opção "Agendado" no filtro de status da página Jobs
  - O filtro agora considera jobs com `scheduled_date` definido
- ✅ **REFATORAÇÃO:** Removidos arquivos obsoletos do frontend
  - Removido `CoinDemo.jsx`, `Metrics.jsx`, `ProductivityReport.jsx`, `Reports.jsx`
- ✅ **FEATURE:** Integração Trello PCP finalizada
  - Adicionada rota `/trello-pcp` e link na sidebar
- ✅ **REFATORAÇÃO:** Migradas rotas de Check-ins para módulo separado
  - Criado `/app/backend/routes/checkins.py`
  - Reduzido `server.py` de 5832 para ~5480 linhas
- ✅ **TESTES E2E:** Revisão completa do sistema
  - ✅ Dashboard: funcionando
  - ✅ Jobs: listagem, agendamento, atribuição de itens
  - ✅ Check-ins: fluxo completo check-in → check-out
  - ✅ Calendário: mostra jobs agendados corretamente
  - ✅ Relatórios: produtividade e por família
  - ✅ KPIs Família: análise por tipo de produto
  - ✅ Bonificação/Gamification: ranking e moedas
  - ✅ Trello PCP: integração funcionando

### 12/01/2026 - Correção de Bug e Migração de Rotas
- ✅ **BUGFIX:** Corrigido `TypeError` no backend que impedia o carregamento do Dashboard do Gerente
  - Problema: Erro ao ordenar check-ins com tipos mistos (datetime/string) no campo `checkin_at`
  - Solução: Normalização de `checkin_at` para string antes da ordenação
- ✅ **REFATORAÇÃO:** Migrada todas as rotas de gamificação de `server.py` para `routes/gamification.py`
  - Redução de ~530 linhas no `server.py` (5567 → 5040 linhas)
  - Todas as rotas de balance, transactions, rewards, redemptions, reports e leaderboard migradas
  - Funções auxiliares (`get_level_from_coins`, `calculate_checkout_coins`, `award_coins`) mantidas no `server.py` para uso em outros endpoints

### 09/01/2026 - Refatoração do Backend
- ✅ **REFATORAÇÃO:** Dividido `server.py` em módulos menores
  - `config.py`: Configurações e constantes
  - `database.py`: Conexão MongoDB
  - `security.py`: Autenticação JWT
  - `models/`: Modelos Pydantic (user, job, checkin, product, gamification, notification)
  - `services/`: Lógica de negócios (product_classifier, holdprint, gamification, image, gps)
  - `routes/`: Estrutura para migração gradual das rotas
- ✅ Implementado Módulo de Gamificação e Bonificação completo
- ✅ Criada Loja Faixa Preta com 7 prêmios padrão
- ✅ Criado Relatório de Bonificação para gerentes/admins
- ✅ Adicionado Widget de Gamificação no Dashboard do Instalador
- ✅ Implementado bônus diário de engajamento
- ✅ Integração automática de cálculo de moedas no checkout
- ✅ Adicionado Ranking Semanal visível para todos os instaladores
- ✅ Implementada Animação de "Chuva de Moedas" após checkout
- ✅ Calendário mostra nome do job (não apenas código)
- ✅ Calendário da Equipe exibe todos os jobs com destaque para "Meus Jobs"
- ✅ Dashboard: Central de Alertas Unificada com 4 tipos de alerta e ícones distintos
- ✅ Dashboard: Ícones em formato infográfico para alertas
- ✅ **KPIs por Família de Produtos:** Análise de m²/hora por tipo de material

### 08/01/2026
- ✅ Corrigido erro de renderização no Dashboard do gerente
- ✅ Implementado sistema de justificativa de jobs
- ✅ Implementado geofencing no checkout
- ✅ Criado calendário da equipe para instaladores
