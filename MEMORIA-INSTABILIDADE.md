# Memória de Sessão — Instabilidade instal-visual.com.br

**Data:** 2026-06-10 | **Última atualização:** 2026-06-10 (fix aplicado)

---

## ❌ ERRO INTRODUZIDO em 2026-06-10 — REVERTER

### O que foi feito (ERRADO)
1. `REACT_APP_BACKEND_URL` foi trocado para `https://instal-visual.com.br/_/backend`
2. Frontend foi redeploy com essa URL errada

### Por que estava ERRADO
`instal-visual.com.br` aponta para o projeto Vercel `instalacao-seguranca` (frontend CRA only).
Esse projeto NÃO tem `experimentalServices` — `/_/backend` é capturado pelo React Router e retorna o HTML do SPA.

O backend FastAPI só está acessível via `backend-henna-one-82.vercel.app/_/backend`
(esse projeto Vercel tem `experimentalServices` e roteia `/_/backend` para o Python).

### Resultado do erro
- Todas as chamadas de API retornam HTML (o SPA)
- `jobs.data` = string HTML → `jobs.forEach` = TypeError → ErrorBoundary em todas as páginas
- O cache localStorage salvou o HTML corrompido, perpetuando o crash

### Correção necessária
Rodar `FIX-BACKEND-URL.bat` (gerado em 2026-06-10) ou manualmente:
```
vercel env rm REACT_APP_BACKEND_URL production --yes
echo "https://backend-henna-one-82.vercel.app/_/backend" | vercel env add REACT_APP_BACKEND_URL production
vercel --prod --yes
```

---

## ⚠️ PROBLEMA ORIGINAL: REACT_APP_BACKEND_URL desatualizada no Vercel

### Diagnóstico confirmado (via browser + análise do bundle)

O bundle JS em produção `main.00b08759.js` tem hardcoded:
```
https://backend-henna-one-82.vercel.app/_/backend
```

O `.env` local (no repositório) já tem o valor correto:
```
REACT_APP_BACKEND_URL=https://instal-visual.com.br/_/backend
```

**Causa:** o Vercel Dashboard do projeto frontend tem o env var `REACT_APP_BACKEND_URL` configurado com o valor antigo (`backend-henna-one-82.vercel.app/_/backend`), que sobrescreve o `.env` do repo durante o build.

### Impacto

- Todas as chamadas de API vão cross-origin para `backend-henna-one-82.vercel.app`
- Esse backend pode estar rodando em commit desatualizado (foi promovido manualmente para `82029d06` em maio/2026)
- Features criadas após esse commit existem no código mas o backend não conhece → 404s silenciosos
- CORS funciona só porque está em wildcard `*` (risco de segurança ARCH-004)

### Correção necessária

1. Acessar Vercel Dashboard → projeto **frontend** (instalacao-seguranca)
2. Settings → Environment Variables
3. Atualizar `REACT_APP_BACKEND_URL` para: `https://instal-visual.com.br/_/backend`
4. Forçar redeploy do frontend

---

## Estado atual do sistema (2026-06-10)

- **Frontend:** carregando normalmente, sem erros JS no console
- **Dashboard:** dados sendo exibidos (usa cache localStorage + 1 chamada API bem-sucedida)
- **Backend `backend-henna-one-82.vercel.app`:** respondendo com 200 para chamadas atuais
- **Supabase `qfsxtwkltfraounsjjah`:** MCP sem permissão de leitura de logs (token/org incorreto no MCP configurado)

---

## Histórico relacionado (do CLAUDE.md)

- Commit `82029d06` — backend promovido como rollback de emergência (2026-05-13)
- Commit `2f53ede` — correção definitiva de login, `.env` atualizado para `instal-visual.com.br/_/backend`
- Vercel Dashboard nunca foi atualizado na época → bug ficou latente até 2026-06-10

---

## 🧠 O QUE GRAVAR NA MEMÓRIA — para nunca repetir

### Regra permanente: vars `REACT_APP_*` são baked at build time

**O `.env` local NÃO é o que importa em produção.** O que importa é o Vercel Dashboard.

Sempre que atualizar qualquer `REACT_APP_*` no `.env`:
1. Abrir [Vercel Dashboard → instalacao-seguranca → Settings → Environment Variables](https://vercel.com/revs-projects-d261c528/instalacao-seguranca/settings/environment-variables)
2. Atualizar o valor para Production + Preview + Development
3. Forçar redeploy (`vercel --prod --yes` ou novo commit)

### Projetos Vercel deste monorepo

| Projeto Vercel | ID | Função |
|---|---|---|
| `instalacao-seguranca` | `prj_m3EZX0120lKppvMjAXnrc8YnnATO` | Frontend CRA (rota `/`) |
| backend (redeploy) | `prj_c6WgOCwCb3zmZ0JW20P9O6Q2TtD8` | FastAPI (rota `/_/backend`) |

### URL correta do backend

```
REACT_APP_BACKEND_URL=https://backend-henna-one-82.vercel.app/_/backend
```

**NÃO usar:** `https://instal-visual.com.br/_/backend`
→ `instal-visual.com.br` é frontend-only; `/_/backend` retorna HTML (SPA catch-all)
→ O projeto que TEM o backend é `backend-henna-one-82.vercel.app` (tem `experimentalServices`)

### Por que backend-henna-one-82 e não instal-visual.com.br?

O domínio `instal-visual.com.br` está configurado no projeto `instalacao-seguranca` (frontend-only).
O projeto `backend-henna-one-82.vercel.app` tem `experimentalServices` que roteia:
- `/` → CRA frontend
- `/_/backend` → FastAPI Python

Para que `instal-visual.com.br/_/backend` funcione, o domínio precisaria estar configurado
no projeto `backend-henna-one-82` — isso exigiria migração de domínio no Vercel Dashboard.

### Como verificar se o bundle está com a URL certa

```js
// No DevTools do browser em instal-visual.com.br:
fetch('/static/js/main.*.js').then(r=>r.text()).then(t=>console.log(t.includes('instal-visual.com.br/_/backend')))
// Deve retornar true
```
