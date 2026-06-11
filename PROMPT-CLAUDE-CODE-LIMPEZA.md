# Prompt para Claude Code — Limpeza e Correções (auditoria 2026-06-11)

Cole o texto abaixo no Claude Code (rodando na raiz do repositório):

---

Leia `PLANO-LIMPEZA-E-PERFORMANCE.md` e `CLAUDE.md` antes de qualquer alteração. Execute as fases abaixo NA ORDEM, com um commit atômico por fase e validação após cada uma. Não invente trabalho fora do escopo.

## Contexto
Uma auditoria já foi feita e parte das correções já está aplicada no working tree (sem commit): política de senha em `backend/routes/users.py`, logging dos `except: pass` em `backend/routes/item_checkins.py`, cache de `product_families` em `backend/routes/checkins.py`, guard de unmount em `frontend/src/pages/Dashboard.jsx` e log no catch do Visual Connect em `frontend/src/pages/InstallerJobDetail.jsx`.

## Fase 0 — Validar e commitar o que já está pronto
1. `cd backend && python -c "from server import app"` (deve importar sem erro)
2. `cd frontend && npm run build` (deve buildar sem erro)
3. Se ambos passarem, commit dos 5 arquivos editados: `fix: correções da auditoria 2026-06-11 (senha, logging, cache, race condition)`

## Fase 1 — Código morto
1. Execute `limpeza-codigo-morto.ps1` (ou replique os `git rm` manualmente). NÃO delete nada relacionado a gamificação — é decisão de negócio pendente.
2. Confirme com grep que nada referencia os arquivos removidos.
3. `npm run build` no frontend de novo. Commit: `chore: remove código morto (auditoria 2026-06-11)`.
4. Apague também (fora do git): `.claude/worktrees/`, `frontend/build/`, `backend/supabase/.temp/`.

## Fase 2 — Correções de estabilidade (uma por commit)
1. **OAuth state**: em `backend/routes/calendar.py`, no `GET /auth/google/callback`, verifique se o parâmetro `state` é validado (HMAC via `_make_oauth_state`/equivalente) ANTES do exchange do `code`. Se não for, implemente a validação e retorne 400 em caso de mismatch.
2. **`update_many`/`delete_many` reais**: em `backend/db_supabase.py` (~linhas 541 e 576), hoje delegam para `update_one`/`delete_one` e afetam só 1 registro. Implemente para todos os registros que casam com o filtro, mantendo a assinatura atual.
3. **Rota duplicada de reset de senha**: existe em `auth_new.py:~612` e em `users.py`. Mantenha apenas UMA (a com `validar_forca_senha` + `require_role`), remova a outra; confira com grep qual delas o frontend chama e ajuste se necessário.
4. **`requests.post` síncrono em rota async**: em `calendar.py`, mude `async def google_callback` para `def` (o DB já é síncrono).
5. **Cleanup de listeners do Service Worker**: em `frontend/src/components/UpdateNotification.jsx` (linhas ~21–40), remova os event listeners (`updatefound`, `statechange`, `controllerchange`) no cleanup do `useEffect`.

## Fase 3 — Performance (uma por commit)
1. **O(n³) em `/reports/by-installer`** (`backend/routes/reports.py:~413`): pré-indexe os checkins com dicts (`by_installer_id` → `by_job_id`) eliminando os loops aninhados de filtragem. A estrutura do JSON de resposta deve permanecer idêntica.
2. **`api.getJob` vs `api.getJobById`** (`frontend/src/utils/api.js:203` e `372`): unifique no que tem cache, mantenha alias deprecado, atualize os callers.
3. **`React.memo`** no JobCard de `frontend/src/pages/Jobs.jsx`, com callbacks estabilizados via `useCallback`.
4. **`loading="lazy"` + `decoding="async"`** nas `<img>` de fotos em `JobDetail.jsx` (~2068, 2349, 2537) e `UnifiedReports.jsx` (~1051), seguindo o padrão de `InstallerJobDetail.jsx:760`.

## Fase 4 — Documentação
Atualize o `CLAUDE.md`: ARCH-002 (JWT backend é 7 dias, não 1), estado real dos PENDING-001..005, e registre as mudanças desta sessão.

## Regras
- NUNCA rode migrations no Supabase nem altere envs da Vercel — apenas liste no final o que falta manualmente (migrations `038_login_attempts.sql` e `039_increment_field_atomic.sql`, envs `REACT_APP_VISUAL_CONNECT_URL/_KEY`, `INLINE_RUNTIME_CHUNK=false`).
- Não faça deploy nem push sem eu pedir.
- Após cada fase: `npm run build` (frontend) e `python -c "from server import app"` (backend). Se quebrar, reverta a fase e me reporte em vez de improvisar.
- Não refatore os arquivos gigantes (`JobDetail.jsx`, `jobs.py`) nesta sessão — é trabalho à parte.
- Responda em português.

Ao final, gere um resumo: commits criados, pendências e passos manuais (Supabase/Vercel).
