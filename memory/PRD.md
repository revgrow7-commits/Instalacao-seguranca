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
│   ├── server.py              # API principal (~5500 linhas)
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
- [ ] Testar gatilhos de notificação push de ponta a ponta
- [ ] Implementar animação de "chuva de moedas" após checkout (CoinAnimation pronto)

### P2 - Média Prioridade
- [ ] Sistema manual de classificação de produtos por família
- [ ] Gerenciamento de prêmios pelo admin na interface

### P3 - Baixa Prioridade
- [ ] Capacidades Offline (PWA)
- [ ] Machine Learning para calibrar matriz de tempo

---

## Issues Conhecidos

1. **Google Calendar (Bloqueado):** Erro 403 - requer configuração de URIs no Google Cloud Console pelo usuário
2. **Resend Email (Bloqueado):** Modo de teste - requer verificação do domínio `industriavisual.com.br`

---

## Changelog

### 09/01/2026
- ✅ Implementado Módulo de Gamificação e Bonificação completo
- ✅ Criada Loja Faixa Preta com 7 prêmios padrão
- ✅ Criado Relatório de Bonificação para gerentes/admins
- ✅ Adicionado Widget de Gamificação no Dashboard do Instalador
- ✅ Implementado bônus diário de engajamento
- ✅ Integração automática de cálculo de moedas no checkout
- ✅ **Adicionado Ranking Semanal** visível para todos os instaladores

### 08/01/2026
- ✅ Corrigido erro de renderização no Dashboard do gerente
- ✅ Implementado sistema de justificativa de jobs
- ✅ Implementado geofencing no checkout
- ✅ Criado calendário da equipe para instaladores
