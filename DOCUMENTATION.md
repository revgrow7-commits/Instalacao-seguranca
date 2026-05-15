# Sistema de Controle de Produtividade de Instaladores
## Documentação Técnica Completa

---

## 1. Visão Geral

Sistema PWA para controle de produtividade de instaladores da Indústria Visual. Gerencia jobs importados da API Holdworks, check-ins/checkouts, gamificação e relatórios.

**URL Produção:** https://instal-visual.com.br

---

## 2. Stack Tecnológico

### Frontend
- **Framework:** React 18
- **Estilização:** Tailwind CSS + Shadcn UI
- **Roteamento:** React Router DOM
- **HTTP Client:** Axios
- **Build:** Create React App

### Backend
- **Framework:** FastAPI (Python 3.11)
- **Autenticação:** JWT (python-jose)
- **Senha:** Bcrypt (passlib)
- **HTTP Requests:** Requests, HTTPX
- **Scheduler:** APScheduler

### Banco de Dados
- **Atual:** MongoDB (Motor - async driver)
- **Migração:** Firebase Firestore (ver seção 8)

---

## 3. Estrutura de Pastas

```
/app
├── backend/
│   ├── server.py              # App principal FastAPI
│   ├── config.py              # Configurações e variáveis de ambiente
│   ├── database.py            # Conexão MongoDB
│   ├── requirements.txt       # Dependências Python
│   ├── .env                   # Variáveis de ambiente
│   ├── routes/
│   │   ├── auth.py            # Autenticação (login, registro, reset senha)
│   │   ├── jobs.py            # CRUD Jobs, importação Holdprint
│   │   ├── checkins.py        # Check-ins legado
│   │   ├── item_checkins.py   # Check-ins por item
│   │   ├── installers.py      # Gerenciamento instaladores
│   │   ├── gamification.py    # Sistema de pontos e ranking
│   │   ├── reports.py         # Relatórios e métricas
│   │   ├── calendar_routes.py # Integração calendário
│   │   └── trello.py          # Integração Trello
│   ├── services/
│   │   ├── scheduler.py       # Sincronização automática
│   │   └── holdprint.py       # Funções auxiliares Holdprint
│   └── models/
│       └── product.py         # Modelos Pydantic
├── frontend/
│   ├── src/
│   │   ├── App.js             # Rotas principais
│   │   ├── index.js           # Entry point
│   │   ├── pages/             # Páginas React
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Jobs.jsx
│   │   │   ├── JobDetail.jsx
│   │   │   ├── Checkins.jsx
│   │   │   ├── Calendar.jsx
│   │   │   └── admin/         # Páginas administrativas
│   │   ├── components/        # Componentes reutilizáveis
│   │   │   └── ui/            # Shadcn UI components
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx
│   │   └── utils/
│   │       └── api.js         # Cliente Axios configurado
│   ├── public/
│   │   └── manifest.json      # PWA manifest
│   └── package.json
└── memory/
    └── PRD.md                 # Product Requirements Document
```

---

## 4. Variáveis de Ambiente

### Backend (.env)
```env
# MongoDB
MONGO_URL=mongodb://localhost:27017
DB_NAME=industria_visual_db

# JWT
JWT_SECRET=your-secret-key

# Holdprint API
HOLDPRINT_API_KEY_SP=<HOLDPRINT_API_KEY_SP — contatar Holdprint/Holdworks>
HOLDPRINT_API_KEY_POA=<HOLDPRINT_API_KEY_POA — contatar Holdprint/Holdworks>

# Email (Resend)
RESEND_API_KEY=your-resend-key
SENDER_EMAIL=noreply@instal-visual.com.br

# URLs
FRONTEND_URL=https://instal-visual.com.br
CORS_ORIGINS=https://instal-visual.com.br

# Google OAuth (opcional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Trello (opcional)
TRELLO_API_KEY=your-trello-key
TRELLO_TOKEN=your-trello-token
TRELLO_BOARD_ID=your-board-id
```

### Frontend (.env)
```env
REACT_APP_BACKEND_URL=https://instal-visual.com.br
REACT_APP_ENABLE_VAPID=true
```

---

## 5. API Endpoints

### Autenticação
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /api/auth/login | Login com email/senha |
| POST | /api/auth/register | Registro de usuário |
| POST | /api/auth/forgot-password | Solicitar reset de senha |
| POST | /api/auth/reset-password | Redefinir senha com token |
| GET | /api/auth/me | Dados do usuário atual |

### Jobs
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /api/jobs | Listar todos os jobs |
| GET | /api/jobs/{id} | Detalhes de um job |
| PUT | /api/jobs/{id} | Atualizar job |
| DELETE | /api/jobs/{id} | Excluir job |
| POST | /api/jobs/import-all | Importar jobs da Holdprint |
| POST | /api/jobs/{id}/assign | Atribuir instaladores |
| POST | /api/jobs/{id}/schedule | Agendar job |
| POST | /api/jobs/{id}/archive | Arquivar job |
| GET | /api/jobs/check-inconsistent | Verificar jobs inconsistentes |
| POST | /api/jobs/fix-inconsistent | Corrigir jobs inconsistentes |

### Check-ins
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /api/item-checkins | Listar check-ins |
| POST | /api/item-checkins | Criar check-in |
| POST | /api/item-checkins/{id}/checkout | Fazer checkout |
| POST | /api/item-checkins/{id}/pause | Pausar check-in |
| POST | /api/item-checkins/{id}/resume | Retomar check-in |

### Instaladores
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /api/installers | Listar instaladores |
| POST | /api/installers | Criar instalador |
| PUT | /api/installers/{id} | Atualizar instalador |
| GET | /api/installers/{id}/stats | Estatísticas do instalador |

### Gamificação
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /api/gamification/ranking | Ranking de instaladores |
| GET | /api/gamification/my-stats | Minhas estatísticas |
| GET | /api/gamification/store | Itens da loja |
| POST | /api/gamification/redeem | Resgatar item |

### Relatórios
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /api/metrics | Métricas gerais |
| GET | /api/reports/productivity | Relatório de produtividade |
| GET | /api/reports/jobs | Relatório de jobs |

---

## 6. Modelos de Dados (Collections MongoDB)

### users
```javascript
{
  id: "uuid",
  email: "email@example.com",
  hashed_password: "bcrypt-hash",
  full_name: "Nome Completo",
  role: "admin" | "manager" | "installer",
  is_active: true,
  created_at: "ISO-date"
}
```

### installers
```javascript
{
  id: "uuid",
  user_id: "uuid",
  full_name: "Nome Completo",
  phone: "51999999999",
  branch: "SP" | "POA",
  is_active: true,
  created_at: "ISO-date"
}
```

### jobs
```javascript
{
  id: "uuid",
  holdprint_job_id: "holdprint-id",
  title: "Título do Job",
  client_name: "Nome do Cliente",
  branch: "SP" | "POA",
  status: "aguardando" | "agendado" | "instalando" | "finalizado" | "arquivado",
  scheduled_date: "ISO-date",
  assigned_installers: ["installer-id-1", "installer-id-2"],
  item_assignments: [
    { item_index: 0, installer_id: "uuid", status: "pending" }
  ],
  archived_items: [
    { item_index: 2, archived_at: "ISO-date", archived_by: "uuid" }
  ],
  items: [...],
  holdprint_data: { /* dados originais da API */ },
  products_with_area: [
    { name: "Produto", quantity: 10, width_m: 1.5, height_m: 2.0, total_area_m2: 30 }
  ],
  total_products: 5,
  total_quantity: 50,
  area_m2: 150.5,
  created_at: "ISO-date",
  completed_at: "ISO-date"
}
```

### item_checkins
```javascript
{
  id: "uuid",
  job_id: "uuid",
  installer_id: "uuid",
  item_index: 0,
  status: "in_progress" | "paused" | "completed",
  checkin_at: "ISO-date",
  checkout_at: "ISO-date",
  duration_minutes: 120,
  checkin_photo: "base64",
  checkout_photo: "base64",
  checkin_location: { lat: -23.5, lng: -46.6 },
  checkout_location: { lat: -23.5, lng: -46.6 },
  pauses: [
    { reason: "Almoço", paused_at: "ISO-date", resumed_at: "ISO-date" }
  ],
  actual_time_min: 115,
  products_installed: [...]
}
```

### gamification_transactions
```javascript
{
  id: "uuid",
  installer_id: "uuid",
  type: "earn" | "spend",
  amount: 100,
  reason: "Conclusão de job #1234",
  created_at: "ISO-date"
}
```

---

## 7. Integração Holdprint API

### Endpoint
```
GET https://api.holdworks.ai/api-key/jobs/data?page=N
```

### Headers
```
x-api-key: <chave-da-unidade>
Accept: application/json
```

### Chaves
- **SP:** `<HOLDPRINT_API_KEY_SP — ver Vercel Dashboard > Environment Variables>`
- **POA:** `<HOLDPRINT_API_KEY_POA — ver Vercel Dashboard > Environment Variables>`

### Resposta
```javascript
{
  data: [...jobs],
  totalCount: 88,
  page: 1,
  pageSize: 20,
  totalPages: 5,
  hasNextPage: true
}
```

### Sincronização Automática
- Scheduler APScheduler executa a cada 30 minutos
- Importa todos os jobs de todas as páginas
- Verifica duplicatas por `holdprint_job_id`

---

## 8. Migração para Firebase + Vercel

### 8.1 Firebase Setup

1. Criar projeto no Firebase Console
2. Ativar Firestore Database
3. Configurar Authentication (Email/Password)
4. Obter credenciais do projeto

### 8.2 Estrutura Firestore

Manter mesma estrutura das collections MongoDB:
- `users`
- `installers`
- `jobs`
- `item_checkins`
- `gamification_transactions`

### 8.3 Alterações no Backend

Substituir Motor/MongoDB por Firebase Admin SDK:

```python
# requirements.txt
firebase-admin==6.2.0

# database.py
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Exemplo de query
async def get_jobs():
    jobs_ref = db.collection('jobs')
    docs = jobs_ref.stream()
    return [doc.to_dict() for doc in docs]
```

### 8.4 Deploy Vercel

**Frontend:**
```bash
cd frontend
vercel --prod
```

**Backend (como Serverless Functions):**
```bash
# vercel.json na raiz
{
  "builds": [
    { "src": "backend/server.py", "use": "@vercel/python" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "backend/server.py" }
  ]
}
```

### 8.5 Variáveis de Ambiente Vercel

Configurar no painel Vercel:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- Todas as outras variáveis do .env

---

## 9. Regras de Negócio Importantes

1. **Status "instalando"** só pode ser definido se houver instaladores atribuídos
2. **Itens arquivados** não aparecem para instaladores - verificar via `archived_items` array
3. **Filtro de mês** não interfere quando filtro de status está ativo
4. **Check-in** requer foto e localização GPS
5. **Checkout** valida distância do local (alerta se > 500m)
6. **Gamificação** atribui pontos automaticamente por conclusão de jobs
7. **Reset de senha** usa link hardcoded: `https://instal-visual.com.br/reset-password?token=...`

---

## 10. Comandos Úteis

### Desenvolvimento Local
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001

# Frontend
cd frontend
yarn install
yarn start
```

### Deploy
```bash
# Via Emergent
# Usar botão "Deploy" no painel

# Via Vercel
vercel --prod
```

### Testes
```bash
# Backend
pytest backend/tests/

# Importar jobs manualmente
curl -X POST "https://instal-visual.com.br/api/jobs/import-all" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"branch": "SP"}'
```

---

## 11. Troubleshooting

### Jobs não importam
1. Verificar chaves de API no painel de Secrets
2. Testar API diretamente: `curl -H "x-api-key: CHAVE" https://api.holdworks.ai/api-key/jobs/data`
3. Verificar logs do backend

### Reset de senha vai para URL errada
- URL está hardcoded em `/backend/server.py` e `/backend/routes/auth.py`
- Verificar se está `https://instal-visual.com.br/reset-password?token=...`

### Itens arquivados aparecem para instalador
- Verificar função `isItemArchived()` em `JobDetail.jsx`
- Verificar array `archived_items` no job

---

## 12. Contatos e Suporte

- **Projeto:** Sistema Faixa Preta / Indústria Visual
- **Plataforma:** Emergent Agent
- **Domínio:** https://instal-visual.com.br
