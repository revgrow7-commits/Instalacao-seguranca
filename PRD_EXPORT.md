# PRD - Sistema Faixa Preta (Indústria Visual)

## Product Requirements Document

---

## 1. Resumo Executivo

**Produto:** Sistema de Controle de Produtividade de Instaladores  
**Cliente:** Indústria Visual  
**Domínio:** https://instal-visual.com.br  
**Tipo:** PWA (Progressive Web App)  

**Objetivo:** Gerenciar a produtividade de equipes de instalação, integrando com o sistema Holdworks para importação de ordens de serviço, controlando check-ins/checkouts, e motivando equipes através de gamificação.

---

## 2. Usuários e Perfis

### 2.1 Administrador (Admin)
- Acesso total ao sistema
- Gerenciamento de usuários
- Configurações do sistema
- Relatórios completos

### 2.2 Gerente (Manager)
- Visualização de todos os jobs
- Atribuição de instaladores
- Agendamento de jobs
- Arquivamento de jobs/itens
- Relatórios de equipe

### 2.3 Instalador (Installer)
- Visualização de jobs atribuídos
- Check-in/checkout com foto e GPS
- Registro de pausas
- Visualização de pontos e ranking

---

## 3. Funcionalidades

### 3.1 Autenticação ✅
- [x] Login com email/senha
- [x] Registro de novos usuários
- [x] Recuperação de senha por email
- [x] JWT para sessões
- [x] Diferentes níveis de acesso por role

### 3.2 Importação de Jobs ✅
- [x] Integração com API Holdworks
- [x] Importação manual por filial (SP/POA)
- [x] Sincronização automática a cada 30 min
- [x] Persistência em banco de dados
- [x] Detecção de duplicatas

### 3.3 Gestão de Jobs ✅
- [x] Listagem com filtros (status, filial, instalador, período)
- [x] Filtro padrão: última semana
- [x] Busca por código do job
- [x] Detalhes do job com produtos/itens
- [x] Atribuição de instaladores ao job
- [x] Atribuição de itens específicos a instaladores
- [x] Agendamento com data/hora
- [x] Arquivamento de jobs
- [x] Arquivamento de itens individuais

### 3.4 Check-in/Check-out ✅
- [x] Check-in por item com foto obrigatória
- [x] Captura de localização GPS
- [x] Checkout com foto de conclusão
- [x] Validação de distância (alerta se > 500m)
- [x] Cálculo automático de tempo
- [x] Sistema de pausas com motivos

### 3.5 Gamificação ✅
- [x] Sistema de pontos (moedas)
- [x] Níveis: Bronze, Prata, Ouro, Diamante, Faixa Preta
- [x] Ranking mensal de instaladores
- [x] Loja para resgate de prêmios
- [x] Histórico de transações

### 3.6 Calendário ✅
- [x] Visualização de jobs agendados
- [x] Drag-and-drop para agendamento
- [x] Calendário da equipe (read-only para instaladores)
- [x] Nome do job exibido no calendário

### 3.7 Relatórios ✅
- [x] Dashboard com métricas gerais
- [x] Relatório de produtividade (m²/hora)
- [x] Relatório de jobs por período
- [x] Estatísticas por instalador

### 3.8 Notificações 🔶
- [x] Toast notifications na interface
- [ ] Push notifications (parcialmente implementado)
- [ ] Notificações por WhatsApp (manual)

---

## 4. Integrações

### 4.1 Holdworks API ✅
- **Status:** Funcional
- **Endpoint:** `https://api.holdworks.ai/api-key/jobs/data`
- **Chaves:**
  - SP: `4e20f4c2-6f84-49e7-9ab9-e27d6930a13a`
  - POA: `84ae7df8-893c-4b0d-9b6e-516def1367f0`

### 4.2 Resend (Email) 🔶
- **Status:** Configurado, aguardando verificação de domínio
- Reset de senha funciona com domínio verificado

### 4.3 Google Calendar ❌
- **Status:** Bloqueado
- Aguardando configuração de credenciais OAuth

### 4.4 Trello ✅
- **Status:** Funcional
- Visualização de quadro PCP

---

## 5. Requisitos Técnicos

### 5.1 Performance
- Tempo de carregamento < 3s
- Filtros otimizados com índices MongoDB
- Projeção seletiva nas queries
- Exclusão de fotos base64 em listagens

### 5.2 Segurança
- Autenticação JWT
- Senhas com bcrypt
- CORS configurado
- Validação de roles em endpoints

### 5.3 Disponibilidade
- Sincronização automática a cada 30 min
- Persistência de dados em MongoDB
- Fallback para dados em cache

---

## 6. Regras de Negócio

### RN01 - Status de Job
- Job só pode ter status "instalando" se tiver instaladores atribuídos
- Endpoint de validação: `POST /api/jobs/fix-inconsistent`

### RN02 - Itens Arquivados
- Itens arquivados não aparecem para instaladores
- Itens arquivados não contam para finalização do job
- Array `archived_items` controla itens arquivados

### RN03 - Check-in
- Foto obrigatória no check-in
- Localização GPS obrigatória
- Apenas instalador atribuído pode fazer check-in

### RN04 - Checkout
- Foto obrigatória no checkout
- Alerta se distância > 500m do local de check-in
- Cálculo automático de tempo trabalhado

### RN05 - Gamificação
- Pontos atribuídos por conclusão de jobs
- Níveis baseados em total de pontos acumulados
- Resgate de prêmios deduz pontos

### RN06 - Filtros
- Filtro padrão: última semana
- Filtro de mês não interfere quando status específico está ativo
- Busca por código ignora outros filtros

---

## 7. Histórico de Versões

### v1.0 - MVP
- Autenticação básica
- Importação de jobs
- Check-in/checkout simples

### v1.5 - Gamificação
- Sistema de pontos
- Ranking
- Loja de prêmios

### v2.0 - Melhorias de UX
- Filtros avançados
- Arquivamento de itens
- Drill-down em dashboards
- Otimização de performance

### v2.1 - Correções
- Fix: Filtros de status
- Fix: Itens arquivados para instaladores
- Fix: URL de reset de senha
- Fix: API Holdprint corrigida

---

## 8. Backlog Futuro

### P1 - Alta Prioridade
- [ ] Gerenciamento de Prêmios (interface admin)
- [ ] Push notifications completo
- [ ] Verificação de domínio Resend

### P2 - Média Prioridade
- [ ] Google Calendar integration
- [ ] Capacidades offline (PWA)
- [ ] Relatórios exportáveis (PDF/Excel)

### P3 - Baixa Prioridade
- [ ] Machine Learning para matriz de tempo
- [ ] Classificação automática de produtos
- [ ] App nativo (React Native)

---

## 9. Métricas de Sucesso

- **Adoção:** 100% dos instaladores usando o sistema
- **Produtividade:** Aumento de 15% em m²/hora
- **Engajamento:** 80% dos instaladores participando da gamificação
- **Precisão:** 95% dos jobs finalizados corretamente

---

## 10. Contatos

- **Projeto:** Sistema Faixa Preta
- **Cliente:** Indústria Visual
- **Produção:** https://instal-visual.com.br
