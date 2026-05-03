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

### Passo 1: Preparar repositório Git

```bash
# Na pasta backend/
cd /path/to/backend
git init
git add .
git commit -m "Initial commit - Backend API"

# Criar repositório no GitHub e conectar
gh repo create industria-visual-api --private --source=. --push
```

### Passo 2: Importar projeto no Vercel (via Git)

1. Acesse **vercel.com/new**
2. Clique em **Import Git Repository**
3. Selecione o repositório `industria-visual-api`
4. Configure as seguintes opções:
   - **Framework Preset**: `Other`
   - **Build Command**: (deixar vazio)
   - **Output Directory**: (deixar vazio)
5. Clique em **Deploy**

> **Nota:** O backend usa `@vercel/python` via `vercel.json`. As rotas são configuradas automaticamente.

### Passo 3: Configurar variáveis de ambiente

Acesse: **Vercel Dashboard** → **industria-visual-api** → **Settings** → **Environment Variables**

Adicione TODAS as variáveis abaixo:

| Nome | Valor |
|------|-------|
| `SUPABASE_URL` | `https://otyrrvkixegiqsthmaaj.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `<rotacionar no Supabase Dashboard → Settings → API>` |
| `SUPABASE_ANON_KEY` | `<ver Supabase Dashboard → Settings → API>` |
| `JWT_SECRET` | `<gerar com: openssl rand -hex 32>` |
| `HOLDPRINT_API_KEY_POA` | `<ver Vercel Env Vars — não commitar>` |
| `HOLDPRINT_API_KEY_SP` | `<ver Vercel Env Vars — não commitar>` |
| `RESEND_API_KEY` | `<ver Resend Dashboard — não commitar>` |
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

### Passo 1: Preparar repositório Git

```bash
# Na pasta frontend/
cd /path/to/frontend
git init
git add .
git commit -m "Initial commit - Frontend"

# Criar repositório no GitHub e conectar
gh repo create industria-visual-frontend --private --source=. --push
```

### Passo 2: Importar projeto no Vercel (via Git)

1. Acesse **vercel.com/new**
2. Clique em **Import Git Repository**
3. Selecione o repositório `industria-visual-frontend`
4. Configure as seguintes opções:
   - **Framework Preset**: `Create React App`
   - **Build Command**: `craco build`
   - **Output Directory**: `build`
   - **Install Command**: `yarn install`
5. Clique em **Deploy**

> **Nota:** O `vercel.json` já contém essas configurações. O Vercel deve detectá-las automaticamente ao importar via Git.

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
