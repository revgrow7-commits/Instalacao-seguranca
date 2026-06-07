# HOTFIX — restaurar `api.instal-visual.com.br`

Estado em 2026-05-13 14:35 BRT, confirmado via Vercel MCP + Supabase MCP.

## O que está quebrado

- `https://api.instal-visual.com.br/api/*` → `fetch failed` consistente (lambda Python crashando antes do response, ou DNS rota inválida)
- `https://instal-visual.com.br/api/auth/me` → retorna HTML do SPA, não JSON (cache CDN possivelmente, mas o REACT_APP_BACKEND_URL aponta para api.instal-visual.com.br, então isso é academic)
- Frontend em `instal-visual.com.br` está num **promote do `dc6e9de0`** (último deploy verde de ontem), funcionando
- Backend em `api.instal-visual.com.br` está no `12bf1206` (Revert), runtime quebrado com `FUNCTION_INVOCATION_FAILED`

## O que está OK

- Banco Supabase `qfsxtwkltfraounsjjah`: schema 100% sincronizado, todas as migrations aplicadas, 5/5 policies RLS otimizadas, 0 ERROR no security advisor
- Frontend está servindo páginas (rollback `dc6e9de0`)
- A correção 028 que apliquei agora (RLS `job_item_assignments`) está em produção no banco

## Sequência exata para você rodar no terminal local

### 1. Sincronizar o working tree

```bash
cd C:\Users\andre\Downloads\claude\Instal-supa\supabase

# Confirmar que ninguém mais está commitando
git fetch origin main
git status
git log HEAD..origin/main --oneline    # mostra os commits que faltam

# Se status mostrar working tree LIMPO, pull direto
git pull origin main

# Se status mostrar arquivos modificados não commitados, stash primeiro:
#   git stash push -m "wip local antes do pull de emergencia"
#   git pull origin main
#   git stash pop    # se quiser reaplicar depois
```

### 2. Confirmar que o backend importa sem erro localmente

Este é o teste-chave. Se passar, o deploy vai funcionar:

```bash
cd backend
python -c "from server import app; print('OK: app imports fine')"
```

**Se der `ModuleNotFoundError`:** anote o nome do módulo. Ele foi removido do `requirements.txt` (provavelmente em `990e03be`) mas alguém ainda importa em algum arquivo. Resolver assim:

```bash
# Achar quem ainda importa o módulo faltante
git grep -nE "^(import|from) <NOME_DO_MODULO>" backend/

# Decidir: ou restaura a dep no requirements.txt, ou remove os import órfãos
```

**Se der outro erro** (SyntaxError, AttributeError em algum decorator do FastAPI, etc.): cole o stacktrace inteiro num arquivo `import_error.txt` e me mande — eu te dou o patch.

### 3. Conferir e atualizar `TABLE_COLUMNS` em `db_supabase.py`

As migrations 028 (`vendedor_email`) e 029 (`installer_nome`, `installer_email`) adicionaram colunas em `visitas_tecnicas`. O `_filter_columns()` precisa saber delas:

```bash
git grep -n "vendedor_email\|installer_nome\|installer_email" backend/db_supabase.py
```

Se algum nome não aparecer no resultado, **o backend está descartando esses campos silenciosamente em INSERTs e UPDATEs** (ARCH-005). Adicionar ao registry de colunas da tabela `visitas_tecnicas`.

### 4. Sincronizar os dois projetos Vercel

Você tem dois projetos rodando o MESMO código mas em commits diferentes — isso é a fonte recorrente do problema.

**Opção A (recomendada):** consolidar tudo num projeto.

1. No painel Vercel → `backend` (api.instal-visual.com.br) → Settings → Domains → **Remover** `api.instal-visual.com.br`.
2. No painel Vercel → `instalacao-seguranca` → Settings → Domains → **Adicionar** `api.instal-visual.com.br` (como alias do frontend project).
3. Trocar `REACT_APP_BACKEND_URL` em Settings → Environment Variables para `https://instal-visual.com.br` (apontando para o mesmo project).
4. Mudar `frontend/src/utils/api.js:4` para que o `/api` seja anexado em `/_/backend/api`:
   ```diff
   - const API_URL = (process.env.REACT_APP_BACKEND_URL?.trim() || window.location.origin) + '/api';
   + const BACKEND_BASE = process.env.REACT_APP_BACKEND_URL?.trim() || window.location.origin;
   + const API_URL = BACKEND_BASE + (BACKEND_BASE.endsWith('.com.br') ? '/_/backend/api' : '/api');
   ```
5. Deletar o projeto Vercel `backend`.

**Opção B (manter dois projetos):** força os dois a sempre deployar do mesmo SHA. Crie um GitHub Action que falha o deploy se o `latestDeployment.meta.githubCommitSha` dos dois projetos divergir por mais de 5 minutos.

### 5. Deploy via GitHub (NUNCA `vercel --prod` direto)

```bash
git status                              # confirmar working tree limpo
git add -A
git commit -m "fix: <descrição precisa>"
git push origin main                    # GitHub dispara deploy em ambos projetos
```

Aguardar **AMBOS** os projetos ficarem READY no painel da Vercel. Não fechar a aba até confirmar.

### 6. Smoke test (em até 2 minutos pós-deploy)

```bash
# Backend responde
curl -sS https://api.instal-visual.com.br/api/ | head -c 200
# Esperado: JSON com {"message": ...} ou similar. NÃO HTML.

# Auth funcionando
curl -sS -X POST https://api.instal-visual.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<seu_email>","password":"<senha_errada>"}'
# Esperado: 401 com JSON {"detail": "..."}. NÃO HTML, NÃO 500.

# Health (se houver endpoint)
curl -sS https://api.instal-visual.com.br/api/health
```

### 7. Se tudo der certo, registrar o que foi feito

Editar `CLAUDE.md` adicionando uma seção "Histórico de correções 2026-05-13" com:
- Causa raiz do `FUNCTION_INVOCATION_FAILED`
- Linha exata que foi corrigida
- Decisão sobre Opção A vs B da seção 4

---

## Se precisar rollback (produção piorando após o deploy)

1. Vercel → `backend` project → Deployments → encontrar `dpl_AzWWn7FPrxEbebxSzPN5t3Z9V8j5` (commit `82029d06`, deploy de 2026-05-12 04:00 BRT, último READY conhecido com tudo OK).
2. Clicar `⋯` → **Promote to Production**.
3. **NA SEQUÊNCIA**, fazer o mesmo no projeto `instalacao-seguranca` para promover o deploy `dpl_5YFnuiVDAtG22ztMJ33ARFsbWHwm` (mesmo commit `82029d06`).
4. Fazer `git revert <novo_sha_quebrado> && git push origin main` para alinhar o GitHub.

---

## O que eu já fiz por você nesta sessão

- ✅ Apliquei a migration faltante `028_rls_initplan_job_item_assignments` no Supabase de produção (foi a única coisa que faltava na DB; todas as outras 023–029 já estavam aplicadas).
- ✅ Verifiquei `vendedor_email`, `installer_nome`, `installer_email` em `visitas_tecnicas` → todos presentes.
- ✅ Verifiquei `coin_transactions_transaction_type_check` → constraint correto com `earn_engagement, earn_checkout, spend_reward, refund`.
- ✅ Auditei imports top-level em `backend/routes/*` e `backend/services/*` → todos satisfeitos pelo `requirements.txt` atual (no working tree local).
- ✅ Gerei `HOTFIX_pending_migrations.sql` (não precisou rodar) e `DEPLOYMENT_RUNBOOK.md` (para o futuro).

## O que eu NÃO consigo fazer daqui

- ❌ `git fetch / git pull` — o shell sandbox da minha sessão não subiu (`Workspace unavailable` em todas as tentativas).
- ❌ Triggerar redeploy via Vercel — meu MCP da Vercel só tem ferramentas read-only.
- ❌ Editar env vars do projeto Vercel.

Sem essas, eu trabalho cego sobre o código que está realmente em produção. Quando você rodar a seção 2 e me passar o resultado de `python -c "from server import app"`, eu fecho o loop em uma resposta com o patch exato.
