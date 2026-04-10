# Deploy Backend - Vercel Serverless

## Estrutura do Projeto

```
backend/
├── api/
│   └── index.py          # Entry point para Vercel Functions
├── routes/               # Rotas FastAPI
├── services/             # Serviços de negócio
├── vercel.json           # Configuração Vercel
└── requirements.txt      # Dependências Python
```

## Pré-requisitos

1. Conta no Vercel (vercel.com)
2. Projeto Supabase configurado
3. Chaves da API Holdprint

## Deploy

### 1. Criar projeto no Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Na pasta backend/
cd backend
vercel login
vercel
```

### 2. Configurar variáveis de ambiente

No dashboard do Vercel (Settings > Environment Variables), adicione:

| Variável | Descrição |
|----------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Service Key do Supabase |
| `SUPABASE_ANON_KEY` | Anon Key do Supabase |
| `JWT_SECRET` | Chave secreta para JWT |
| `HOLDPRINT_API_KEY_POA` | Chave API Holdprint POA |
| `HOLDPRINT_API_KEY_SP` | Chave API Holdprint SP |
| `RESEND_API_KEY` | Chave API Resend (emails) |
| `SENDER_EMAIL` | Email remetente |
| `FRONTEND_URL` | https://instal-visual.com.br |
| `VAPID_PUBLIC_KEY` | Chave pública VAPID |
| `VAPID_PRIVATE_KEY` | Chave privada VAPID |
| `VAPID_CLAIMS_EMAIL` | Email VAPID |
| `VERCEL` | 1 |
| `SERVERLESS` | true |

### 3. Configurar Cron Job

O arquivo `vercel.json` já configura o cron para rodar a cada 30 minutos:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-holdprint",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

**Nota:** Cron jobs são disponíveis apenas no plano Pro do Vercel.
Para plano gratuito, use serviços externos como:
- cron-job.org
- easycron.com

### 4. Configurar domínio personalizado

1. Vá em Settings > Domains
2. Adicione: `api.instal-visual.com.br`
3. Configure DNS no seu provedor:
   - Tipo: CNAME
   - Nome: api
   - Valor: cname.vercel-dns.com

## Endpoints Principais

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/auth/login` | POST | Login |
| `/api/jobs` | GET | Listar jobs |
| `/api/installers` | GET | Listar instaladores |
| `/api/cron/sync-holdprint` | GET/POST | Sincronização Holdprint |
| `/health` | GET | Health check |

## Monitoramento

- **Logs:** Vercel Dashboard > Logs
- **Métricas:** Vercel Dashboard > Analytics
- **Cron:** Vercel Dashboard > Cron Jobs

## Troubleshooting

### Erro: "Function timed out"
- Vercel tem limite de 10s (free) ou 60s (pro)
- A sincronização Holdprint pode precisar de mais tempo
- Considere usar Vercel Pro ou dividir em chunks

### Erro: "Module not found"
- Verifique `requirements.txt`
- Use `vercel logs` para ver detalhes

### Cron não executa
- Cron requer Vercel Pro
- Verifique se o endpoint `/api/cron/sync-holdprint` está acessível
- Use serviço externo de cron se necessário
