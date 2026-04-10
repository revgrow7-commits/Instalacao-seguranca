# Indústria Visual - Backend API

API FastAPI para o sistema de controle de produtividade de instaladores.

## Stack
- **Framework:** FastAPI (Python)
- **Banco de Dados:** Supabase (PostgreSQL)
- **Deploy:** Vercel Serverless Functions

## Estrutura

```
backend/
├── api/
│   └── index.py          # Entry point Vercel
├── routes/               # Rotas da API
├── services/             # Lógica de negócio
├── models/               # Modelos Pydantic
├── vercel.json           # Config Vercel
└── requirements.txt      # Dependências
```

## Deploy no Vercel

1. Conecte este repositório no Vercel
2. Configure as variáveis de ambiente (ver `.env.example`)
3. Deploy automático a cada push

## Endpoints Principais

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/auth/login` | POST | Login |
| `/api/jobs` | GET | Listar jobs |
| `/api/installers` | GET | Listar instaladores |
| `/api/cron/sync-holdprint` | GET | Sync Holdprint (Cron) |
| `/health` | GET | Health check |

## Variáveis de Ambiente

Veja `.env.example` para a lista completa.

## Desenvolvimento Local

```bash
# Instalar dependências
pip install -r requirements.txt

# Rodar servidor
uvicorn server:app --reload --port 8001
```
