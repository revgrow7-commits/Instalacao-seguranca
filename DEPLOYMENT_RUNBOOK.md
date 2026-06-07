# Deployment Runbook — instal-visual.com.br

Este runbook existe porque o histórico recente de deploys mostrou três padrões problemáticos:

- O mesmo commit foi deployado várias vezes seguidas (até 6x no caso de `12bf1206`), misturando origens (GitHub auto-deploy e `vercel --prod` via CLI).
- Vários deploys foram feitos com `gitDirty: "1"` — código rodando em produção que não corresponde a nenhum SHA do Git.
- A produção entrou num estado em que `frontend = dc6e9de0` mas `backend = 12bf1206`, porque o último deploy do frontend foi um *promote* (rollback de emergência) enquanto o backend ficou no commit novo quebrado.

A política abaixo elimina os três.

---

## Topologia

Existem dois projetos na Vercel, ambos vinculados ao mesmo repo `revgrow7-commits/Instalacao-seguranca` no GitHub:

| Projeto | Domínio | Função | Auto-deploy |
|---|---|---|---|
| `instalacao-seguranca` | `instal-visual.com.br` | frontend (CRA) + backend embarcado em `/_/backend` via `experimentalServices` | sim, via GitHub push |
| `backend` | `api.instal-visual.com.br` | mesmo código backend, deploy independente | sim, via GitHub push |

Toda vez que um commit é pushado para `main`, **ambos os projetos rebuilam**. Eles podem dessincronizar quando um deploy falha em um e sucede no outro.

> **Decisão pendente:** consolidar num único projeto (mantendo `api.` como alias) ou separar formalmente (frontend só CRA, backend num projeto Python). O cenário atual (dois projetos com o mesmo código) multiplica trabalho e atrito.

Banco: Supabase `qfsxtwkltfraounsjjah` (**não** `otyrrvkixegiqsthmaaj`, que é o `somos-industriavisual.com.br`).

---

## Pré-requisitos de cada deploy

Antes de fazer push para `main` ou rodar `vercel --prod`:

1. **Working tree limpo.** `git status` deve mostrar "nothing to commit, working tree clean". Nada de `gitDirty=1` em produção — sempre commitar antes de deployar.
2. **Sincronizado com origin.** `git fetch && git status` deve dizer "Your branch is up to date with 'origin/main'". Se está atrás, **pull antes**.
3. **Build local passa.** `cd frontend && npm run build` sem erros. `cd backend && python -c "from server import app"` sem `ModuleNotFoundError`.
4. **Migrations novas aplicadas no Supabase ANTES do deploy do código que as usa.** Veja seção "Ordem correta" abaixo.

---

## Ordem correta de deploy

### Para código que toca apenas frontend (componentes, páginas, hooks, estilos)

```
git pull origin main
git add -A && git commit -m "feat/fix: ..."
git push origin main      # Vercel auto-deploya
```

Aguardar o deploy ficar READY no painel, conferir o smoke test (seção abaixo).

### Para código que toca backend MAS não muda schema

Igual ao anterior. Mas conferir antes do push:
- `requirements.txt` está alinhado com os `import` do código. Se adicionou dependência nova, ela está listada. Se removeu dependência, **fez `git grep` no nome dela** para garantir que nenhum arquivo ainda importa.
- Se removeu dep para resolver `Lambda size exceeded`, rodar localmente: `python -c "from server import app"` para detectar imports órfãos ANTES do deploy.

### Para código que toca schema do banco (qualquer arquivo em `backend/migrations/`)

A ordem importa. Inversão = produção com schema/codigo desalinhados:

1. **Aplique a migration no Supabase primeiro** (SQL Editor → cole o arquivo → Run). Verifique o `\d` da tabela depois.
2. **Confirme que adicionou a coluna no `TABLE_COLUMNS` de `backend/db_supabase.py`.** Senão o `_filter_columns()` vai descartar o campo silenciosamente em INSERTs (ARCH-005). Esse é o bug que faz "feature funcionar local e quebrar em prod sem mensagem de erro".
3. Push o código.
4. Smoke test específico daquela feature.

> **Se inverter (deploy primeiro, migration depois):** o código tentará escrever em colunas que não existem, e o `_filter_columns()` vai dropar silenciosamente. Você não verá erro no log — só dados sumindo.

### Para deploys de hotfix urgente via CLI

Evitar. Se realmente urgente:
1. Commit local primeiro (sem `gitDirty`).
2. `vercel --prod` com o working tree limpo no commit pretendido.
3. **Imediatamente depois**, `git push origin main` para que GitHub e Vercel fiquem sincronizados.

---

## Rollback de emergência

Quando um deploy quebra produção (500 generalizado, erro de import, JS crash):

1. No painel Vercel do projeto afetado → **Deployments** → encontre o último deploy verde antes do problema → clique em `⋯` → **Promote to Production**. Isso restabelece o serviço imediatamente sem build novo (~10s).
2. **Importante:** uma promoção **não** muda o `main` do GitHub. O HEAD do Git continua apontando para o commit quebrado. Você precisa:
   - Ou fazer `git revert <sha_quebrado> && git push` (preserva história, reaplicável depois)
   - Ou fazer `git reset --hard <sha_bom> && git push --force-with-lease` (apaga o commit, mais arriscado)
3. **Promover nos dois projetos**, não só um. Se promover só no `instalacao-seguranca` e esquecer do `backend`, a frontend rolla mas a API em `api.instal-visual.com.br` continua quebrada.
4. Anotar o incidente: data, commit quebrado, motivo, fix. Cinco minutos para escrever isso economiza horas no próximo incidente parecido.

---

## Smoke test pós-deploy

Após cada deploy de produção, em até 2 minutos:

**Backend (api.instal-visual.com.br):**
- `curl https://api.instal-visual.com.br/health` → 200
- `curl https://api.instal-visual.com.br/api/` → 200 com JSON
- Se houver migration nova: tentar a operação que usa a coluna nova (criar VT com vendedor_email, por exemplo) e conferir que o campo persistiu no banco.

**Frontend (instal-visual.com.br):**
- Login no painel admin com credenciais reais — confirma que o `/api/auth/login` está respondendo.
- Abrir `/jobs` — confirma que o `/api/jobs` está respondendo e o token não foi invalidado.
- Em pelo menos um dispositivo mobile real, abrir o portal do instalador (`/installer`) — checkin/checkout dependem de GPS e a UX é diferente do desktop.

**Logs:**
- No painel Vercel → Logs do `backend` projeto → últimos 5 minutos → confirmar que não há `500` ou `error` recente.

---

## Sinais de alerta no histórico que justificam parar e investigar

Se você vir qualquer um destes no painel Vercel, **não faça outro deploy em cima**:

- "Same commit deployed 3+ times in a row" — sinal de retry mascarando um problema.
- "Bundle size exceeds Lambda limit" — não pode resolver removendo dep aleatória sem rodar `python -c "from server import app"` local primeiro.
- `actor: claude-code_X-X-XXX_agent` + `gitDirty: "1"` — deploy feito via CLI com working tree sujo. Anote o SHA, faça `git diff` contra ele, identifique se há diferença, commite e re-deploy via GitHub.
- Frontend e backend em commits diferentes (`get_project.latestDeployment.meta.githubCommitSha`) — corrigir antes de qualquer feature nova.

---

## Variáveis de ambiente que precisam estar setadas

Em ambos os projetos Vercel (`instalacao-seguranca` e `backend`), nos três environments (Production, Preview, Development):

**Obrigatórias do CLAUDE.md:**
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `HOLDPRINT_API_KEY_POA`, `HOLDPRINT_API_KEY_SP`, `RESEND_API_KEY`, `SENDER_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `REACT_APP_BACKEND_URL`.

**Adicionadas em sessões recentes (verificar se estão lá):**
- `CS_INTEGRATION_TOKEN` — usado por `routes/cs_integration.py`. Se faltar, `/api/cs/colaboradores` retorna 503 "CS Integration não configurada".
- `FRONTEND_URL`, `RESEND_FROM_EMAIL`, `VAPID_CLAIMS_EMAIL`, `GOOGLE_INSTALLER_REDIRECT_URI` — têm defaults, mas se o default não bate com o domínio de produção, links em emails saem errados.

Para checar:
- Painel Vercel → Project → Settings → Environment Variables.

---

## Comandos úteis de diagnóstico

```bash
# Que commit está em produção agora (via Vercel API):
#   ver get_project.latestDeployment.meta.githubCommitSha no MCP Vercel.

# Quantos commits estou atrás:
git fetch && git log HEAD..origin/main --oneline

# Que arquivos backend foram tocados nos últimos N commits:
git log --name-only --pretty=format:'%h %s' -20 -- backend/

# Confirmar que todos os imports top-level do backend resolvem:
cd backend && python -c "from server import app; print('OK')"

# Auditar imports suspeitos (PIL, jwt, pywebpush) que talvez tenham ficado órfãos:
git grep -nE '^(import|from) (jwt|pywebpush|py_vapid|PIL)' backend/

# Confirmar que TABLE_COLUMNS tem uma coluna específica:
git grep -n "vendedor_email" backend/db_supabase.py

# Diff entre o que rodou em produção e o local:
git fetch && git log <prod_sha>..HEAD --stat
```

---

## Anti-padrões a NÃO repetir

- Resolver `Lambda size exceeded` removendo dependências do `requirements.txt` sem `git grep` no nome delas primeiro.
- Resolver um deploy quebrado com outro deploy antes de entender o motivo do anterior.
- Confiar que a migration foi aplicada porque o arquivo `.sql` está no repo. Migrations são manuais — sempre conferir no Supabase.
- Deployar `vercel --prod` com working tree sujo e dizer "depois eu commito".
- Promover deploy antigo em produção e esquecer de fazer `git revert` no GitHub correspondente.
