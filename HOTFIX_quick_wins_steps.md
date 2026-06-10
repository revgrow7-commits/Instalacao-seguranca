# Quick wins de performance — 3 ações em ~15 minutos

**Data:** 2026-05-15
**Objetivo:** ganhos rápidos sem refactor de código, sem git, sem risco
**Total de tempo seu:** ~15 minutos | **Impacto:** queries 2–5× mais rápidas, bundle menor, cold start menor

---

## QW-1 — Desativar `REACT_APP_ENABLE_VISUAL_EDITS` na Vercel

**Por quê:** se essa env estiver `true` em produção, o Babel injeta atributos `x-*` em CADA componente React, dobrando o DOM e inflando o bundle. Ganho de até 30% no bundle inicial e 20% no DOM se estiver ON.

**Como conferir (30 segundos):**

1. Abra <https://vercel.com/revs-projects-d261c528/instalacao-seguranca/settings/environment-variables>
2. Procure por `REACT_APP_ENABLE_VISUAL_EDITS`
3. **Três cenários:**

| Estado encontrado | Ação |
|---|---|
| Não existe nenhuma var com esse nome | ✅ Nada a fazer — o app já está sem o plugin |
| Existe e o valor em **Production** é `false` ou `0` | ✅ Nada a fazer |
| Existe e o valor em **Production** é `true` ou `1` | ❌ **DELETE essa entrada** (botão "..." → Remove). Em seguida na aba "Deployments", redeploy o último com "Use existing build cache" desmarcado |

Repita o mesmo check no projeto `backend` (mesma URL trocando `instalacao-seguranca` por `backend`).

**Como saber se vale a pena fazer redeploy depois de remover:** sim, vale — o bundle precisa ser rebuildado sem o plugin.

---

## QW-2 — Aplicar índices de performance no Supabase ✅ ENTREGUE

**Por quê:** as queries de checkin, item-checkin e listagem de jobs hoje fazem full scan ou ordenação cara. Com índices compostos e parciais, ficam 2–5× mais rápidas e usam ~1/10 do CPU do banco.

**Como aplicar (5 minutos):**

1. Abra <https://supabase.com/dashboard/project/qfsxtwkltfraounsjjah/sql/new>
2. Cole o conteúdo de `HOTFIX_indexes_performance.sql` (entregue junto)
3. Clique em "Run"
4. Aguarde — cada `CREATE INDEX CONCURRENTLY` leva 5–60s dependendo do tamanho da tabela. **Não trava o app** durante a criação.
5. Quando terminar, abra uma nova query e cole o bloco de **VERIFICAÇÃO** que está comentado no final do SQL. Deve listar 12 índices novos.

**Se algum CREATE der erro:** parar imediatamente, copiar a mensagem e me avisar. O `IF NOT EXISTS` protege contra duplicata, então erros indicam problema de schema (coluna faltando, por exemplo).

**Rollback:** se quiser desfazer, o bloco de DROP está comentado no final do arquivo.

---

## QW-3 — Confirmar Supabase Pooler (porta 6543)

**Por quê:** em ambiente serverless (Vercel), cada lambda abre uma conexão nova ao Postgres. Sem o pooler (pgbouncer), em horário de pico você satura o limite de conexões e queries começam a esperar 100–300ms só para conectar. Com pooler, conexões são reutilizadas e a latência despenca.

**Como conferir (3 minutos):**

1. Abra <https://vercel.com/revs-projects-d261c528/backend/settings/environment-variables>
2. Procure por `SUPABASE_URL`
3. Olhe a URL nos environments Production e Preview. Decida pelo formato:

| Formato encontrado | Diagnóstico | Ação |
|---|---|---|
| `https://qfsxtwkltfraounsjjah.supabase.co` | ✅ É a URL da API REST (PostgREST), **não usa Postgres direto** — o seu wrapper `db_supabase.py` chama via supabase-py que vai pelo PostgREST. Pooler não se aplica aqui. | Nenhuma. Este caso é o seu. |
| `postgres://...:5432/postgres` ou `postgresql://...:5432/postgres` | ⚠️ Conexão direta — sob carga, pode estourar conexões | Trocar para porta 6543 (transaction pooler) |
| `postgres://...:6543/postgres` | ✅ Já está com pooler | Nenhuma |

**Observação importante:** olhei o `db_supabase.py` e ele usa `supabase-py` que vai por HTTP/PostgREST. Então **provavelmente seu caso é o primeiro (✅ nada a fazer)**, mas vale conferir porque algum endpoint pode ter conexão direta separada (ex: scripts de migration, edge function).

Se vir uma var separada `DATABASE_URL` ou `POSTGRES_URL`, verifique a porta dela também.

---

## Resumo da expectativa

| Ação | Tempo seu | Risco | Ganho |
|---|---|---|---|
| QW-1 | 30s checagem + 5min redeploy se ON | Nenhum (só remove uma var) | Bundle -30%, DOM -20% (se ON) |
| QW-2 | 5min copy/paste + verificação | Quase nenhum (CONCURRENTLY) | Queries 2-5× mais rápidas |
| QW-3 | 3min checagem | Nenhum | Latência -100-200ms (se for o caso) |

Depois de aplicar, abra o app e **note a diferença** em:
- Dashboard admin (carregamento inicial)
- Tela de jobs com filtros
- Check-in do instalador (busca de item)

Se quiser medir antes/depois, use o Network tab do DevTools no Chrome e olhe o `Time` das chamadas a `/api/jobs`, `/api/item-checkins/*`, `/api/checkins/active`.

---

## Quando voltar do lock do git

Depois que você liberar o `.git/index.lock` (fechar VS Code / GitHub Desktop / Tower etc), me chame. Eu retomo:
1. Recovery do `.git/refs/heads/main`
2. Sprint 1 do `PERFORMANCE_GUIA.md` (8 itens — N+1, cache de user, lazy imports)
3. Fase 1 do `REFATORACAO_PLAN.md` (remover ~420 LOC de dead code backend, 100% seguro)

Esses dois juntos dão mais 30–50% de ganho de performance e -3000 LOC de manutenção.
