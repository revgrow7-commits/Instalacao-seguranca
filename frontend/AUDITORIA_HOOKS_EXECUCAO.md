# Execução da auditoria de hooks — relatório

**Data:** 2026-05-14
**Escopo executado:** todas as fases do plano (0 a 4c) + correção de incidente
**Modo:** Plano B — edições de arquivo via API, commits via script PowerShell entregue ao usuário

---

## TL;DR

Foram tocados **18 arquivos** (4 novos, 14 editados) endereçando os 2 bugs latentes (B1, B2), 4 dos 5 itens 🟡 (M1, M2, M3, M4), e 3 dos 6 🟢 (R1, R4, R5). Phase 4b (extração de modais) e R6 (limpar useMemo em VisitasRelatorios) ficaram fora — documentados como follow-up.

`Jobs.jsx` foi de **47 useState / 12 chamadas a `api.*` / 2261 linhas** para **43 useState / 1 chamada a `api.*` / 2111 linhas**. A única `api.*` restante é `getCsResponsaveis` no auto-complete do dialog de ticket (concern do dialog, não dos jobs).

`useJobs` saiu de "exportado mas não consumido" para o **single source of truth** de listagem, importação Holdprint, agendamento, finalização, arquivamento, justificativa, batch, bulk e ticket CS — usado por `Jobs.jsx`.

---

## Fases executadas

### Fase 0 — preparação
**Achado bloqueante:** working tree tinha 186 arquivos modificados não-commitados. Investigação revelou:
- 181 deles eram puro CRLF↔LF (Windows reescreveu line endings sem `.gitattributes`)
- 5 tinham mudanças reais — um **hotfix em andamento** de outro contribuidor (`getPhotoSrc`, rename de `start_time` → `paused_at`)
- 2 desses 5 (`Checkins.jsx`, `InstallerJobDetail.jsx`) estavam **quebrados** — tinham `export default` removido e terminavam com `\ No newline at end of file`

**Decisão:** stash do hotfix antes de qualquer mudança (executa no script PowerShell), trabalho em árvore "limpa" via API de arquivos, depois usuário re-aplica o stash.

**Bloqueio técnico encontrado:** `.git/index.lock` cravado por processo Windows. Impossível rodar `git stash` / `git rm` da sandbox Linux. Pivotou para entrega via script.

**Saída:** `frontend/.gitattributes` criado com `* text=auto eol=lf` para encerrar o problema de CRLF de uma vez.

---

### Fase 1 — quick wins seguros

| Item | O que | Onde |
|------|-------|------|
| **R1** | ESLint flat config 9.x com `react-hooks/exhaustive-deps` ativo + script `lint`/`lint:fix`/`lint:hooks` | `frontend/eslint.config.js` (novo, 123 linhas), `package.json` |
| **R4** | `usePushNotifications`: feature-detection movida para módulo (`PUSH_SUPPORTED` const) → elimina flash de "não suportado" no primeiro render | `src/hooks/usePushNotifications.js` |
| **R5** | Verificado e marcado para deleção (no script): `use-toast.js` + `ui/toast.jsx` + `ui/toaster.jsx` + `ui/sonner.jsx` (~301 linhas mortas — App usa `Toaster` de `sonner`) | listados no script |
| **M2** | `useCatalogos`: 6 fetches paralelos agora todos passam por `cancelledRef` antes de `setState` | `src/hooks/useCatalogos.js` |
| **M3** | `VisitaDetail`: `loadVisita` envolto em `useCallback([id, navigate])` + `useEffect([loadVisita])` | `src/pages/VisitaDetail.jsx` |
| **M4** | `useJobs` agora aceita `{ canSeeInstallers }` — instaladores não disparam mais 403 silencioso em `getInstallers()` | `src/hooks/useJobs.js` |

---

### Fase 2 — `useApiCall` + 3 piloto

Hook genérico criado:

- `src/hooks/useApiCall.js` (129 linhas) — wrapper para fetch + loading + error + cancelamento + toast configurável + refresh manual + suporte a `deps`/`immediate`/`extractData`/`onSuccess`/`onError`. Refs internos para `apiFn` / callbacks evitam re-fire em arrow functions inline.
- `src/hooks/README.md` (148 linhas) — convenções, anti-patterns, inventário, guia de quando usar.
- `src/hooks/index.js` agora re-exporta `useApiCall`, `useReschedule`, `useCatalogos`, `usePushNotifications` além de `useJobs`.

**Migrações:**
- ✅ `Users.jsx` — duas chamadas `useApiCall` substituem `loadData` + `useEffect` + 3 `useState` (canonical demo).
- 🟡 `Calendar.jsx` — não migrou pra useApiCall (loadData faz 3 fetches + transforma visitas em events + filtra por role — refatoração arriscaria comportamento). **B2 fix aplicado** (useCallback + deps explícitas).
- 🟡 `Dashboard.jsx` — mesmo motivo (6 fetches paralelos + 2 branches admin/non). **B2 fix aplicado**.

Decisão documentada nos próprios arquivos (comentário "Why not useApiCall: …" em Dashboard).

---

### Fase 3 — fix de stale closure (B2) nas demais

| Página | Mudança |
|--------|---------|
| `JobDetail.jsx` | `loadData` → `useCallback([jobId, isAdmin, isManager, navigate])` |
| `LojaFaixaPreta.jsx` | `loadData` → `useCallback([])` |
| `SchedulerAdmin.jsx` | `fetchData` → `useCallback([])` (interval re-firing também consertado) |
| `InstallerDashboard.jsx` | 5 loaders (`loadJobs`, `loadCheckins`, `loadVisitas`, `loadGamificationData`, `registerDailyEngagement`) todos em `useCallback`, useEffect lista todos como deps |

**Não tocados** (overlap com hotfix em stash): `Checkins.jsx`, `InstallerJobDetail.jsx`. Devem receber B2 fix em PR separado depois do hotfix mergear.

---

### Fase 4a — estender `useJobs.js`

Reescrita completa do hook (129 → 343 linhas) com TODOS os métodos que `Jobs.jsx` precisava:

- **Reads:** `fetchJobs(includeArchived)`, `fetchInstallers()`, `refresh`
- **Sync:** `syncBranch(branch, month, year)`, `syncCurrentMonth()`
- **Single mutations:** `updateJob`, `scheduleJob({ date, time, installerIds })`, `finalizeJob`, `finalizeWithoutInstall`, `archiveJob({ archive, excludeFromMetrics })`, `submitJustification({ type, reason, jobTitle, jobCode })`
- **Batch:** `batchSchedule(ids, date, installerIds)`, `batchArchive(ids)`, `bulkArchivePre2026()`
- **CS ticket:** `createCsTicket(job, payload)`
- **Helpers:** `getJobById`, `setJobs` (escape hatch)

Cada mutation faz `setJobs(prev => …)` otimista após sucesso da API. Toasts padronizados. Logging com prefixo `[useJobs]`.

---

### Fase 4b — extração de modais (PULADA)

**Decisão:** documentado como follow-up, não executado. Razão: extrair 5 dialogs de `Jobs.jsx` (~600 linhas de JSX) sem poder rodar `yarn build` para validar é risco alto demais. Outra PR.

Quando alguém for fazer, o caminho está pronto: cada cluster de useState identificado já está agrupado por comentário em `Jobs.jsx`. Recomendado:
1. `ScheduleDialog` (5 useState)
2. `JustifyDialog` (5 useState)
3. `BatchScheduleDialog` (4 useState)
4. `ImportHoldprintDialog` (5 useState)
5. `TicketDialog` (10 useState — usar `useReducer`)

Após extração, `Jobs.jsx` deve cair de 2111 → ~1100 linhas e dos 43 useState para ~14.

---

### Fase 4c — `Jobs.jsx` consome `useJobs` (RESOLVE B1)

Substituições:

| Antes | Depois |
|-------|--------|
| `useState([])` para `jobs`, `installers`, `loading`, `syncing` | `useJobs({ canSeeInstallers })` desestruturado |
| `loadInstallers()` (deletado) | hook auto-fetch |
| `loadJobs(includeArchived)` (32 linhas) | wrapper de 4 linhas que chama `fetchJobs` |
| `loadHoldprintJobs()` (33 linhas) | `await syncBranch(...)` |
| `loadCurrentMonthJobs()` (32 linhas) | `await syncCurrentMonth()` |
| `handleFinalizeNoInstallation` (16 linhas API) | `await finalizeWithoutInstall(jobId)` |
| `handleSubmitTicket` (19 linhas API) | `await createCsTicket(job, payload)` |
| `handleSubmitJustification` (22 linhas) | `await submitJustification(jobId, ...)` |
| `handleScheduleJob` (28 linhas) | `await hookScheduleJob(jobId, ...)` |
| `handleArchiveJob` (24 linhas) | `await hookArchiveJob(jobId, ...)` |
| `handleBatchSchedule` (22 linhas) | `await batchSchedule(...)` |
| `handleBatchArchive` (21 linhas) | `await batchArchive(...)` |
| `handleBulkArchivePre2026` (16 linhas) | `await bulkArchivePre2026()` |

Pós-fix: 1 chamada `api.*` restante, **150 linhas a menos** em `Jobs.jsx`. Bug B1 (hook + página fora de sincronia) eliminado — agora há uma fonte só.

---

### Fase 5 — R6 (PULADA)

Limpar 13 `useMemo` em `VisitasRelatorios.jsx` é polimento opcional, não bug. Fica como follow-up de baixa prioridade.

---

## Incidente encontrado durante execução

**Bytes NUL em `Jobs.jsx`.** Após o último Edit, o arquivo ficou com 5896 bytes NUL no fim (depois do `export default Jobs;`). Causa provável: filesystem mount Windows não truncou o arquivo quando os Edits o encurtaram. Sintoma: `grep` classificava o arquivo como binário.

**Conserto:** `python3` leu os primeiros 92654 bytes (conteúdo real) e regravou. Confirmado: 0 NULs, 2111 linhas, `export default Jobs;` intacto.

Preventivo no script PowerShell: passa-se `Get-Content` + `Set-Content` em todos os arquivos editados para forçar reescrita limpa antes do commit.

---

## Arquivos tocados (snapshot)

**Novos (4):**
```
frontend/.gitattributes              (41 linhas)
frontend/eslint.config.js            (123 linhas)
frontend/src/hooks/useApiCall.js     (129 linhas)
frontend/src/hooks/README.md         (148 linhas)
```

**Editados (14):**
```
frontend/package.json                       — scripts lint
frontend/src/hooks/index.js                 — re-exports
frontend/src/hooks/useJobs.js               — rewrite + canSeeInstallers
frontend/src/hooks/useCatalogos.js          — cancellation
frontend/src/hooks/usePushNotifications.js  — eager init
frontend/src/pages/VisitaDetail.jsx         — useCallback
frontend/src/pages/Users.jsx                — useApiCall demo
frontend/src/pages/Calendar.jsx             — B2 fix
frontend/src/pages/Dashboard.jsx            — B2 fix
frontend/src/pages/JobDetail.jsx            — B2 fix
frontend/src/pages/LojaFaixaPreta.jsx       — B2 fix
frontend/src/pages/SchedulerAdmin.jsx       — B2 fix
frontend/src/pages/InstallerDashboard.jsx   — B2 fix
frontend/src/pages/Jobs.jsx                 — consome useJobs (B1 resolvido)
```

**Marcados para deleção (não tocados, vão no script):**
```
frontend/src/hooks/use-toast.js              (155 linhas)
frontend/src/components/ui/toast.jsx         (85)
frontend/src/components/ui/toaster.jsx       (33)
frontend/src/components/ui/sonner.jsx        (28)
```

---

## O que NÃO foi feito (e por quê)

| Item | Status | Motivo |
|------|--------|--------|
| Hotfix `getPhotoSrc` (Checkins.jsx + InstallerJobDetail.jsx) | Bloqueado | Trabalho em andamento de outra pessoa, 2 arquivos sem `export default`. **Continua no working tree pra você completar manualmente.** |
| B2 fix em Checkins.jsx, InstallerJobDetail.jsx | Adiado | Overlap com o hotfix acima — tem que ir junto |
| Phase 4b — extração de modais de Jobs.jsx | Pulada | Risco alto sem `yarn build`. Documentada como follow-up |
| R6 — limpar useMemo em VisitasRelatorios | Pulada | Polimento opcional |
| R2 — padronizar nomenclatura `loadX` vs `fetchX` | Pulada | Cosmético; bom em PR de cleanup, não nessa rodada |
| R3 — `Set` vs `{}` em filter state | Pulada | Cosmético |
| `yarn build` de validação | Não rodado | Sandbox Linux + lock Windows + 2 arquivos quebrados do hotfix → impossível |

---

## Próximos passos recomendados (na sua máquina)

1. **Rodar o script PowerShell** entregue (`AUDITORIA_HOOKS_APLICAR.ps1`).
2. **Antes de push**: `yarn build` localmente. Se quebrar, você verá em qual arquivo. Os candidatos mais prováveis a problema: `Jobs.jsx` (mexi mais) e `useJobs.js` (rewrite).
3. **Reaplicar o hotfix do stash**: `git stash pop` — esperar conflito em line-endings (resolver com `git checkout --ours`) e em handlers de `Checkins.jsx`/`InstallerJobDetail.jsx` (mantém o que vem do stash).
4. **Completar o hotfix manualmente** — adicionar `</Tabs></div>);}; export default Checkins;` no fim de `Checkins.jsx` e o equivalente em `InstallerJobDetail.jsx`.
5. **Testar manualmente em produção**: importar Holdprint, agendar job, finalizar, justificar, abrir ticket CS, arquivar individual, arquivar em batch, bulk archive pre-2026. **Esses são os fluxos que mexi pesado em `Jobs.jsx`.**
6. **Rodar `yarn lint`** uma vez. Vai cuspir muitos warnings de exhaustive-deps em arquivos que NÃO toquei. Triagem incremental, não bloqueia deploy.
7. **PR follow-up sugerida (próxima semana):**
   - Phase 4b — extração de modais
   - R6 — useMemo cleanup
   - B2 fix em Checkins/InstallerJobDetail (depois que hotfix mergear)
