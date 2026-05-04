Indústria Visual

## Visão Geral do Projeto

**Indústria Visual** é uma plataforma web de gestão operacional para empresas de **comunicação visual e instalação**. O sistema centraliza o ciclo completo de trabalho: desde a importação de jobs até o controle de check-ins em campo por instaladores, geração de relatórios e bonificação por desempenho.

- **URL base:** `https://instal-visual.com.br`
- **Idioma:** Português do Brasil
- **Tema:** Dark mode com cor de destaque rosa/pink
- **Tipo:** SPA (Single Page Application) com carregamento assíncrono

---

## Módulos e Funcionalidades

### 1. Dashboard (`/dashboard`)
Painel central de visão geral. Exibe métricas consolidadas de jobs, check-ins e desempenho operacional.

### 2. Jobs (`/jobs`)
Gerenciamento de ordens de serviço de instalação.
- Contadores: Total, Aguardando, Instalando, Agendados
- Filtros por: status, filial, instalador, período
- Importação via integração com **Holdprint**
- Ações por job: Agendar, Justificar atraso, Sem Instalação, Arquivar
- Status: `AGUARDANDO`, `INSTALANDO`, `AGENDADO`
- Atributos: código (#), filial, cliente, data prevista, instalador atribuído

### 3. Check-ins (`/checkins`)
Registro de presença e execução em campo pelos instaladores.
- Contadores: Total, Em Andamento, Completos, Pausados
- Cada registro contém: foto de entrada, foto de saída, GPS (lat/long/precisão), horário, duração e m² instalados
- Alerta de `ATRASO` quando checkout não é realizado em mais de 4h
- Filtros por status e instalador
- Abas: Todos, Check-ins (entradas), Check-outs (saídas)
- Visualização individual em `/checkin-viewer/{uuid}`

### 4. Relatórios (`/reports`)
Relatórios gerenciais de produção e performance por período.

### 5. KPIs Família (`/reports/kpis`)
Indicadores-chave de desempenho agrupados por família de produtos/serviços.

### 6. Bonificação (`/gamification-report`)
Sistema de gamificação para bonificação de instaladores com base em performance e metas.

### 7. Calendário (`/calendar`)
Calendário de instalações com visualização mensal.
- Painel lateral com jobs não agendados (arrastáveis para datas)
- Integração opcional com Google Calendar
- Filtro por filial

### 8. Usuários (`/users`)
Gestão de usuários e permissões do sistema.
- Perfis: `ADMINISTRADOR`, `GERENTE`, `INSTALADOR`
- Atributos: nome, e-mail, telefone, filial, status (ativo/inativo)

### 9. Agendamentos (`/admin/scheduler`)
Painel de tarefas automáticas do sistema.
- Sincronização com Holdprint diariamente às 06:00 (horário de Brasília)
- Permite pausar ou executar manualmente
- Exibe data/hora e quantidade de jobs importados na última sincronização

---

## Integrações Externas

- **Holdprint**: Sistema de origem dos jobs. Sincronização automática via scheduler ou manual.
- **Google Calendar**: Integração opcional para espelhar o calendário de instalações.
- **GPS/Geolocalização**: Captura de coordenadas nos check-ins via dispositivo móvel.

---

## Perfis de Usuário

| Perfil | Descrição |
|---|---|
| Administrador | Acesso total, incluindo usuários e agendamentos |
| Gerente | Acesso gerencial a relatórios e jobs |
| Instalador | Realiza check-ins em campo via app mobile |

---

## Terminologia do Domínio

- **Job**: Ordem de serviço de instalação de comunicação visual
- **Check-in / Check-out**: Registro de entrada e saída do instalador no local do job
- **Holdprint**: Plataforma de origem dos pedidos, integrada via API
- **Filial**: Unidade regional (ex: `POA` = Porto Alegre, `SP` = São Paulo)
- **m² Instalado**: Métrica de área instalada registrada no checkout
- **Hold**: Job com previsão de entrega pendente de definição
