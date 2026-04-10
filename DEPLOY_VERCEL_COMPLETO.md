# 🚀 GUIA DE DEPLOY - VERCEL

Este guia detalha o processo completo de deploy do sistema Indústria Visual no Vercel.

---

## 📋 PRÉ-REQUISITOS

1. Conta no Vercel (vercel.com)
2. Vercel CLI instalado: `npm i -g vercel`
3. Git instalado
4. Projeto Supabase já configurado ✅

---

## 🔧 PARTE 1: DEPLOY DO BACKEND (API)

### Passo 1: Preparar repositório

```bash
# Criar novo repositório para o backend (se ainda não existir)
cd /path/to/backend
git init
git add .
git commit -m "Initial commit - Backend API"
```

### Passo 2: Deploy inicial

```bash
# Na pasta backend/
vercel login
vercel

# Responda às perguntas:
# - Set up and deploy? Y
# - Which scope? [sua conta]
# - Link to existing project? N
# - Project name: industria-visual-api
# - Directory with code? ./
# - Override settings? N
```

### Passo 3: Configurar variáveis de ambiente

Acesse: **Vercel Dashboard** → **industria-visual-api** → **Settings** → **Environment Variables**

Adicione TODAS as variáveis abaixo:

| Nome | Valor |
|------|-------|
| `SUPABASE_URL` | `https://otyrrvkixegiqsthmaaj.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `sb_secret_uMmCrswTXuAAI0buga8NQQ_vFRSMRWb` |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `JWT_SECRET` | `your-secret-key-change-in-production-123456789` |
| `HOLDPRINT_API_KEY_POA` | `84ae7df8-893c-4b0d-9b6e-516def1367f0` |
| `HOLDPRINT_API_KEY_SP` | `4e20f4c2-6f84-49e7-9ab9-e27d6930a13a` |
| `RESEND_API_KEY` | `re_hh6JyAXw_6sykfRUqxqkE1FbDzja6H7V5` |
| `SENDER_EMAIL` | `bruno@industriavisual.com.br` |
| `FRONTEND_URL` | `https://instal-visual.com.br` |
| `VAPID_PUBLIC_KEY` | `BEB4S64ZcE5l5YAzZv4Ey3NaP3FBnprFE0vm...` |
| `VAPID_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\nMIGHAgEA...` |
| `VAPID_CLAIMS_EMAIL` | `bruno@industriavisual.com.br` |
| `VERCEL` | `1` |
| `SERVERLESS` | `true` |
| `CORS_ORIGINS` | `https://instal-visual.com.br,https://www.instal-visual.com.br` |

### Passo 4: Redeploy com variáveis

```bash
vercel --prod
```

### Passo 5: Configurar domínio customizado

1. Vá em **Settings** → **Domains**
2. Adicione: `api.instal-visual.com.br`
3. Configure DNS no seu provedor:

```
Tipo: CNAME
Nome: api
Valor: cname.vercel-dns.com
```

### Passo 6: Verificar deploy

```bash
# Teste o health check
curl https://api.instal-visual.com.br/health

# Teste a API
curl https://api.instal-visual.com.br/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@industriavisual.com","password":"admin123"}'
```

---

## 🎨 PARTE 2: DEPLOY DO FRONTEND

### Passo 1: Preparar repositório

```bash
# Criar novo repositório para o frontend (se ainda não existir)
cd /path/to/frontend
git init
git add .
git commit -m "Initial commit - Frontend"
```

### Passo 2: Deploy inicial

```bash
# Na pasta frontend/
vercel login
vercel

# Responda às perguntas:
# - Set up and deploy? Y
# - Which scope? [sua conta]
# - Link to existing project? N
# - Project name: industria-visual
# - Directory with code? ./
# - Override settings? N
```

### Passo 3: Configurar variável de ambiente

Acesse: **Vercel Dashboard** → **industria-visual** → **Settings** → **Environment Variables**

| Nome | Valor |
|------|-------|
| `REACT_APP_BACKEND_URL` | `https://api.instal-visual.com.br` |

### Passo 4: Redeploy com variáveis

```bash
vercel --prod
```

### Passo 5: Configurar domínio customizado

1. Vá em **Settings** → **Domains**
2. Adicione: `instal-visual.com.br`
3. Adicione: `www.instal-visual.com.br`
4. Configure DNS:

```
# Domínio raiz
Tipo: A
Nome: @
Valor: 76.76.21.21

# WWW
Tipo: CNAME
Nome: www
Valor: cname.vercel-dns.com
```

---

## ⏰ PARTE 3: CONFIGURAR CRON JOB

O Vercel Cron Jobs requer plano **Pro** ($20/mês).

### Opção A: Vercel Pro (Recomendado)
O cron já está configurado no `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/sync-holdprint",
    "schedule": "*/30 * * * *"
  }]
}
```

### Opção B: Serviço externo (Gratuito)
Use cron-job.org ou easycron.com:

1. Crie conta no cron-job.org
2. Adicione novo cron job:
   - URL: `https://api.instal-visual.com.br/api/cron/sync-holdprint`
   - Método: GET
   - Intervalo: Every 30 minutes
   - Headers: (nenhum necessário)

---

## ✅ CHECKLIST FINAL

### Backend
- [ ] Deploy realizado
- [ ] Variáveis de ambiente configuradas
- [ ] Domínio `api.instal-visual.com.br` configurado
- [ ] `/health` retornando 200
- [ ] `/api/auth/login` funcionando

### Frontend
- [ ] Deploy realizado
- [ ] `REACT_APP_BACKEND_URL` configurada
- [ ] Domínio `instal-visual.com.br` configurado
- [ ] Login funcionando
- [ ] Dashboard carregando dados

### Cron
- [ ] Cron configurado (Vercel Pro ou externo)
- [ ] Sync executando a cada 30 minutos
- [ ] Jobs sendo importados

---

## 🔍 TROUBLESHOOTING

### Erro: "Function Timeout"
- Vercel Free: limite de 10s
- Vercel Pro: limite de 60s
- Solução: Use Vercel Pro ou divida operações

### Erro: "CORS"
- Verifique `CORS_ORIGINS` no backend
- Certifique-se que inclui o domínio do frontend

### Erro: "Module not found"
- Verifique `requirements.txt`
- Execute `vercel logs` para detalhes

### Frontend não conecta ao backend
- Verifique `REACT_APP_BACKEND_URL`
- Certifique-se que está usando `https://`
- Verifique se o domínio do backend está correto

---

## 📞 SUPORTE

Em caso de problemas:
1. Verifique os logs: `vercel logs`
2. Verifique o dashboard: vercel.com/dashboard
3. Documentação: vercel.com/docs
