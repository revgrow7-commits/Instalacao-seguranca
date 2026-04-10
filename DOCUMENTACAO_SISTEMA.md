# INDÚSTRIA VISUAL - Sistema de Gestão de Instalações

## Documentação Técnica e Manual do Usuário

**Versão:** 2.0  
**Data:** Abril 2026  
**Desenvolvido por:** Emergent Labs

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Configuração e Deploy](#configuração-e-deploy)
4. [Manual do Usuário](#manual-do-usuário)
5. [API Reference](#api-reference)
6. [Segurança](#segurança)
7. [Manutenção](#manutenção)

---

## 1. Visão Geral

### 1.1 Descrição do Sistema

O Sistema de Gestão de Instalações da Indústria Visual é uma aplicação PWA (Progressive Web App) desenvolvida para controlar a produtividade de instaladores de comunicação visual. O sistema oferece:

- **Gestão de Jobs/Ordens de Serviço**: Importação automática da API Holdprint
- **Check-in/Check-out**: Controle de presença com geolocalização
- **Gamificação**: Sistema de moedas e ranking para motivação
- **Dashboards**: Visão gerencial de KPIs e produtividade
- **Relatórios**: Exportação de dados em Excel

### 1.2 Tecnologias Utilizadas

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18, Tailwind CSS, Shadcn/UI |
| Backend | FastAPI (Python 3.11) |
| Banco de Dados | Supabase (PostgreSQL) |
| Autenticação | JWT + Supabase |
| Email | Resend API |
| Hospedagem | Vercel (Serverless) |

### 1.3 Perfis de Usuário

| Perfil | Permissões |
|--------|------------|
| **Admin** | Acesso total ao sistema |
| **Gerente** | Gestão de jobs, instaladores e relatórios |
| **Instalador** | Visualização de jobs atribuídos, check-in/out |

---

## 2. Arquitetura do Sistema

### 2.1 Estrutura de Diretórios

```
/app/
├── backend/
│   ├── api/
│   │   └── index.py           # Entry point Vercel Serverless
│   ├── routes/
│   │   ├── auth_new.py        # Autenticação (Supabase + Resend)
│   │   ├── jobs.py            # Gestão de Jobs
│   │   ├── checkins.py        # Check-in/Check-out
│   │   ├── item_checkins.py   # Check-in por item
│   │   ├── gamification.py    # Sistema de moedas
│   │   ├── reports.py         # Relatórios Excel
│   │   └── ...
│   ├── services/
│   │   ├── sync_holdprint.py  # Sincronização Holdprint
│   │   ├── gamification.py    # Lógica de gamificação
│   │   └── ...
│   ├── db_supabase.py         # Wrapper Supabase (Síncrono)
│   ├── server.py              # Servidor FastAPI principal
│   └── config.py              # Configurações
│
├── frontend/
│   ├── src/
│   │   ├── pages/             # Páginas React
│   │   ├── components/        # Componentes reutilizáveis
│   │   ├── context/           # Contextos (Auth)
│   │   ├── hooks/             # Custom hooks
│   │   └── utils/             # Utilitários (API, tokenManager)
│   └── public/                # Assets estáticos
│
└── memory/
    └── PRD.md                 # Documento de Requisitos
```

### 2.2 Fluxo de Dados

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Supabase   │
│   (React)   │◀────│  (FastAPI)  │◀────│ (PostgreSQL)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Holdprint  │
                    │    API      │
                    └─────────────┘
```

### 2.3 Modelo de Dados

#### Tabela: users
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| email | VARCHAR | Email do usuário |
| password_hash | VARCHAR | Hash bcrypt da senha |
| name | VARCHAR | Nome do usuário |
| role | VARCHAR | admin/manager/installer |
| branch | VARCHAR | Filial (POA/SP) |
| is_active | BOOLEAN | Status ativo |

#### Tabela: jobs
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| holdprint_id | INTEGER | ID na API Holdprint |
| code | VARCHAR | Código do job (ex: #1604) |
| client_name | VARCHAR | Nome do cliente |
| status | VARCHAR | Status atual |
| scheduled_date | TIMESTAMP | Data agendada |
| branch | VARCHAR | Filial |

#### Tabela: installers
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| user_id | UUID | FK para users |
| full_name | VARCHAR | Nome completo |
| coins | INTEGER | Moedas acumuladas |
| total_area_installed | FLOAT | Área total instalada (m²) |

---

## 3. Configuração e Deploy

### 3.1 Variáveis de Ambiente - Backend

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
USE_SUPABASE=true

# Frontend URL (para emails de reset)
FRONTEND_URL=https://instal-visual.com.br

# API Holdprint
HOLDPRINT_API_KEY_POA=your-poa-key
HOLDPRINT_API_KEY_SP=your-sp-key

# Email (Resend)
RESEND_API_KEY=your-resend-key
SENDER_EMAIL=bruno@industriavisual.com.br

# Vercel
VERCEL=1
SERVERLESS=true
CORS_ORIGINS=https://instal-visual.com.br
```

### 3.2 Variáveis de Ambiente - Frontend

```env
REACT_APP_BACKEND_URL=https://api.instal-visual.com.br
```

### 3.3 Deploy no Vercel

1. **Salvar no GitHub**: Use "Save to GitHub" no Emergent
2. **Conectar ao Vercel**: Importe o repositório
3. **Configurar variáveis**: Settings → Environment Variables
4. **Deploy**: Automático após push

### 3.4 Configuração DNS (Registro.br)

| Tipo | Nome | Valor |
|------|------|-------|
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |
| CNAME | api | cname.vercel-dns.com |

---

## 4. Manual do Usuário

### 4.1 Login

1. Acesse `https://instal-visual.com.br`
2. Digite seu email e senha
3. Clique em "Entrar"

**Credenciais de Admin:**
- Email: `mktindustriavisual@gmail.com`
- Senha: `@Industria123456`

### 4.2 Dashboard (Admin/Gerente)

O dashboard exibe:
- **Jobs em andamento**: Quantidade e status
- **Check-ins ativos**: Instaladores trabalhando
- **Produtividade**: Área instalada no mês
- **Ranking**: Top instaladores

### 4.3 Gestão de Jobs

#### Listar Jobs
- Menu lateral → "Jobs"
- Use filtros: Status, Data, Filial, Instalador
- Busque por código: Digite "#1604" para encontrar job específico

#### Atribuir Itens
1. Clique no job desejado
2. Clique em "Atribuir Itens"
3. Selecione os itens
4. Escolha o instalador
5. Defina nível de dificuldade e cenário
6. Clique em "Atribuir"

#### Arquivar Job
- Na lista de jobs, clique no ícone de arquivo
- Jobs arquivados não aparecem para instaladores

### 4.4 Check-in/Check-out (Instalador)

#### Fazer Check-in
1. Acesse o job atribuído
2. Clique em "Iniciar Check-in"
3. Permita acesso à localização
4. Tire foto do local (opcional)
5. Confirme o check-in

#### Fazer Check-out
1. No job em andamento, clique em "Finalizar"
2. Tire foto da instalação concluída
3. Informe a área instalada
4. Confirme o check-out

### 4.5 Gamificação

#### Sistema de Moedas
| Ação | Moedas |
|------|--------|
| Check-in no prazo | 50% do total |
| Foto no check-out | 20% do total |
| Primeiro acesso do dia | 10% do total |
| Produtividade base | 20% do total |

**Conversão:** 1 m² instalado = 10 moedas base

#### Níveis
| Nível | Moedas Necessárias |
|-------|-------------------|
| Bronze | 0 - 499 |
| Prata | 500 - 1.999 |
| Ouro | 2.000 - 4.999 |
| Faixa Preta | 5.000+ |

---

## 5. API Reference

### 5.1 Autenticação

#### POST /api/auth/login
```json
Request:
{
  "email": "user@example.com",
  "password": "senha123"
}

Response:
{
  "access_token": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Nome",
    "role": "admin"
  }
}
```

#### POST /api/auth/forgot-password
```json
Request:
{
  "email": "user@example.com"
}

Response:
{
  "message": "Se o email existir, você receberá um link...",
  "email_sent": true
}
```

#### POST /api/auth/reset-password
```json
Request:
{
  "token": "reset-token",
  "new_password": "novaSenha123"
}

Response:
{
  "message": "Senha alterada com sucesso!"
}
```

### 5.2 Jobs

#### GET /api/jobs
Lista todos os jobs com filtros opcionais.

**Query Parameters:**
- `status`: Filtrar por status
- `branch`: Filtrar por filial
- `month`: Filtrar por mês (1-12)
- `year`: Filtrar por ano
- `search`: Buscar por código ou cliente

#### POST /api/jobs/{job_id}/assign-items
```json
Request:
{
  "item_indices": [0, 1],
  "installer_ids": ["uuid-installer"],
  "difficulty_level": "Nível 2 - Fácil",
  "scenario_category": "02 - Shopping",
  "apply_to_all": true
}

Response:
{
  "message": "2 atribuições criadas com sucesso",
  "assignments": [...]
}
```

### 5.3 Check-ins

#### POST /api/item-checkins
```json
Request:
{
  "job_id": "uuid",
  "item_index": 0,
  "installer_id": "uuid",
  "latitude": -30.0277,
  "longitude": -51.2287,
  "checkin_photo": "base64..."
}
```

#### POST /api/item-checkins/{checkin_id}/checkout
```json
Request:
{
  "latitude": -30.0277,
  "longitude": -51.2287,
  "checkout_photo": "base64...",
  "installed_m2": 15.5,
  "notes": "Instalação concluída"
}
```

---

## 6. Segurança

### 6.1 Autenticação

- **JWT Tokens**: Expiram em 7 dias
- **Armazenamento**: sessionStorage (não localStorage)
- **Proteção XSS**: Sanitização de tokens
- **Senhas**: Hash bcrypt com salt

### 6.2 Autorização

- Rotas protegidas por middleware `require_role`
- Verificação de permissões por endpoint
- Instaladores só veem jobs atribuídos

### 6.3 Boas Práticas

- Variáveis de ambiente para credenciais
- CORS configurado para domínios específicos
- HTTPS obrigatório em produção
- Logs de ações sensíveis

---

## 7. Manutenção

### 7.1 Sincronização Holdprint

A sincronização automática ocorre às 06:00 (BRT) diariamente.

**Sincronização Manual:**
```bash
curl -X POST https://api.instal-visual.com.br/api/cron/sync \
  -H "Authorization: Bearer CRON_SECRET"
```

### 7.2 Logs

**Vercel:**
- Dashboard → Functions → Logs

**Local:**
```bash
tail -f /var/log/supervisor/backend.err.log
```

### 7.3 Backup

O Supabase realiza backups automáticos. Para backup manual:
1. Acesse o Supabase Dashboard
2. Settings → Database → Backups
3. Clique em "Create backup"

### 7.4 Troubleshooting

| Problema | Solução |
|----------|---------|
| Login não funciona | Verificar FRONTEND_URL no backend |
| Jobs não aparecem | Verificar chaves da API Holdprint |
| Email não envia | Verificar domínio no Resend |
| Erro 500 | Verificar logs do Vercel |

---

## Contato e Suporte

**Desenvolvido por:** Emergent Labs  
**Email:** suporte@emergentagent.com  
**Documentação:** https://docs.emergentagent.com

---

*Este documento foi gerado automaticamente em Abril de 2026.*
