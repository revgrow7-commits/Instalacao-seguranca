# 🔗 CONECTAR GITHUB + VERCEL - PASSO A PASSO

## VISÃO GERAL

Você terá **2 repositórios** no GitHub:
1. `industria-visual-api` (Backend)
2. `industria-visual` (Frontend)

E **2 projetos** no Vercel conectados a esses repositórios.

---

## PARTE 1: CRIAR REPOSITÓRIOS NO GITHUB

### 1.1 Criar repositório do Backend

1. Acesse github.com e faça login
2. Clique em **"New repository"** (botão verde)
3. Preencha:
   - Repository name: `industria-visual-api`
   - Description: `Backend API - Sistema de Produtividade`
   - Visibility: **Private** (recomendado)
4. Clique **"Create repository"**

### 1.2 Criar repositório do Frontend

1. Clique em **"New repository"** novamente
2. Preencha:
   - Repository name: `industria-visual`
   - Description: `Frontend - Sistema de Produtividade`
   - Visibility: **Private** (recomendado)
3. Clique **"Create repository"**

---

## PARTE 2: FAZER UPLOAD DO CÓDIGO

### Opção A: Via GitHub Web (mais fácil)

1. No repositório criado, clique **"uploading an existing file"**
2. Arraste os arquivos da pasta correspondente
3. Clique **"Commit changes"**

### Opção B: Via Git CLI

```bash
# Backend
cd /path/to/backend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/industria-visual-api.git
git push -u origin main

# Frontend
cd /path/to/frontend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/industria-visual.git
git push -u origin main
```

---

## PARTE 3: CONECTAR VERCEL AO GITHUB

### 3.1 Deploy do Backend

1. Acesse **vercel.com** e faça login
2. Clique **"Add New Project"**
3. Clique **"Import Git Repository"**
4. Selecione **"industria-visual-api"**
5. Configure:
   - Framework Preset: **Other**
   - Root Directory: **`./`**
   - Build Command: (deixe vazio)
   - Output Directory: (deixe vazio)
6. Clique **"Deploy"**

### 3.2 Configurar Variáveis do Backend

Após o deploy inicial:

1. Vá em **Settings** → **Environment Variables**
2. Adicione TODAS as variáveis (copie da lista abaixo):

```
SUPABASE_URL = https://otyrrvkixegiqsthmaaj.supabase.co
SUPABASE_SERVICE_KEY = sb_secret_uMmCrswTXuAAI0buga8NQQ_vFRSMRWb
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eXJydmtpeGVnaXFzdGhtYWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDU2NzMsImV4cCI6MjA5MDAyMTY3M30.kLdWIRB-LXLBmBu-tTSHNDBlKclDHw5rIyTmWCsB3rs
JWT_SECRET = your-secret-key-change-in-production-123456789
HOLDPRINT_API_KEY_POA = 84ae7df8-893c-4b0d-9b6e-516def1367f0
HOLDPRINT_API_KEY_SP = 4e20f4c2-6f84-49e7-9ab9-e27d6930a13a
RESEND_API_KEY = re_hh6JyAXw_6sykfRUqxqkE1FbDzja6H7V5
SENDER_EMAIL = bruno@industriavisual.com.br
FRONTEND_URL = https://instal-visual.com.br
VAPID_PUBLIC_KEY = BEB4S64ZcE5l5YAzZv4Ey3NaP3FBnprFE0vmCOGKVP4DN7pW_5IeDfzlCmcseOnttsePt6YfdKXTZxHTUSCujfY
VAPID_PRIVATE_KEY = -----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgIHcFAmZhWS4okCYQnP5Lu5J76QO4wNXzYuXMH18bElyhRANCAARAeEuuGXBOZeWAM2b+BMtzWj9xQZ6axRNL5gjhilT+Aze6Vv+SHg385QpnLHjp7bbHj7emH3Sl02cR01Egro32\n-----END PRIVATE KEY-----
VAPID_CLAIMS_EMAIL = bruno@industriavisual.com.br
VERCEL = 1
SERVERLESS = true
CORS_ORIGINS = https://instal-visual.com.br,https://www.instal-visual.com.br
```

3. Clique **"Save"**
4. Vá em **Deployments** → clique nos 3 pontos → **"Redeploy"**

### 3.3 Configurar Domínio do Backend

1. Vá em **Settings** → **Domains**
2. Adicione: `api.instal-visual.com.br`
3. Configure o DNS (veja seção DNS abaixo)

### 3.4 Deploy do Frontend

1. Volte ao Dashboard do Vercel
2. Clique **"Add New Project"**
3. Selecione **"industria-visual"**
4. Configure:
   - Framework Preset: **Create React App**
   - Root Directory: **`./`**
5. Clique **"Deploy"**

### 3.5 Configurar Variáveis do Frontend

1. Vá em **Settings** → **Environment Variables**
2. Adicione:

```
REACT_APP_BACKEND_URL = https://api.instal-visual.com.br
```

3. Clique **"Save"**
4. Faça **Redeploy**

### 3.6 Configurar Domínio do Frontend

1. Vá em **Settings** → **Domains**
2. Adicione: `instal-visual.com.br`
3. Adicione: `www.instal-visual.com.br`

---

## PARTE 4: CONFIGURAR DNS

No seu provedor de domínio (Registro.br, Cloudflare, etc.):

### Para api.instal-visual.com.br:
```
Tipo: CNAME
Nome: api
Valor: cname.vercel-dns.com
```

### Para instal-visual.com.br:
```
Tipo: A
Nome: @
Valor: 76.76.21.21
```

### Para www.instal-visual.com.br:
```
Tipo: CNAME
Nome: www
Valor: cname.vercel-dns.com
```

---

## PARTE 5: VERIFICAR DEPLOY

### Testar Backend:
```bash
curl https://api.instal-visual.com.br/health
# Deve retornar: {"status": "healthy"}
```

### Testar Frontend:
- Acesse https://instal-visual.com.br
- Faça login com suas credenciais

---

## 🎉 PRONTO!

A partir de agora, toda vez que você fizer push para o GitHub:
- O Vercel fará deploy automático
- As mudanças estarão online em ~1-2 minutos

---

## TROUBLESHOOTING

### "Function timed out"
- O plano gratuito do Vercel tem limite de 10 segundos
- Considere upgrade para Pro ($20/mês) para 60 segundos

### "Module not found"
- Verifique se todos os imports estão corretos
- Veja os logs em: Vercel Dashboard → Deployments → View Logs

### CORS Error
- Verifique se `CORS_ORIGINS` inclui seu domínio frontend
- Certifique-se de usar `https://` (não `http://`)
