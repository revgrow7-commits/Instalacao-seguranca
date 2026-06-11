Usando o Vercel CLI já autenticado nesta máquina, corrija o env var errado no projeto `instalacao-seguranca` e faça redeploy do frontend para produção.

**O problema:** O bundle em produção está chamando `backend-henna-one-82.vercel.app/_/backend` porque o Vercel Dashboard tem o env var `REACT_APP_BACKEND_URL` com valor antigo. O `.env` local já tem o valor correto mas o Vercel sobrescreve.

**Execute exatamente isso:**

```bash
cd /caminho/para/supabase/frontend

# 1. Remove o valor antigo de todos os environments
vercel env rm REACT_APP_BACKEND_URL production --yes
vercel env rm REACT_APP_BACKEND_URL preview --yes  
vercel env rm REACT_APP_BACKEND_URL development --yes

# 2. Adiciona o valor correto
echo "https://instal-visual.com.br/_/backend" | vercel env add REACT_APP_BACKEND_URL production
echo "https://instal-visual.com.br/_/backend" | vercel env add REACT_APP_BACKEND_URL preview
echo "https://instal-visual.com.br/_/backend" | vercel env add REACT_APP_BACKEND_URL development

# 3. Confirma
vercel env ls | grep REACT_APP_BACKEND

# 4. Redeploy para produção
vercel --prod --yes
```

**Contexto:**
- Project ID frontend: `prj_m3EZX0120lKppvMjAXnrc8YnnATO`
- Team: `revs-projects-d261c528`
- Pasta do frontend: `C:\Users\andre\Downloads\claude\Instal-supa\supabase\frontend`

Confirme cada passo e mostre o output. Se der erro de autenticação, rode `vercel whoami` primeiro para confirmar o login.
