# Plano de Limpeza, Estabilidade e Performance — 2026-06-11

Auditoria completa do código (backend FastAPI + frontend React) feita em 11/06/2026.
Complementa `AUDITORIA_CODIGO.md` e o histórico do `CLAUDE.md`.

---

## 1. O que JÁ FOI APLICADO nesta sessão (revisar e commitar)

| Arquivo | Mudança | Motivo |
|---|---|---|
| `backend/routes/users.py` | Senha mínima 6 → política unificada (8 chars + letra + número) via `validar_forca_senha` nas rotas `/users/change-password` e reset admin | Política de senha inconsistente: `auth_new.py` exigia 8, `users.py` aceitava 6 (brecha de força bruta) |
| `backend/routes/item_checkins.py` | 3× `except Exception: pass` → agora logam `logger.warning(..., exc_info=True)` | Erros engolidos em validações de segurança do checkout (idempotência, ordem temporal EXIF, duração) ficavam invisíveis |
| `backend/routes/checkins.py` | Cache em memória (TTL 5 min) para `product_families` em `detect_product_family` | Eliminava 1 query ao banco em **cada** check-in/checkout |
| `frontend/src/pages/Dashboard.jsx` | Guard `mountedRef` em `loadPrimary`/`loadAlerts` | Race condition: setState após unmount em navegação rápida |
| `frontend/src/pages/InstallerJobDetail.jsx` | `.catch(() => {})` do Visual Connect agora loga `console.warn` | Falha silenciosa impedia debug do campo `meuPapel` |
| `limpeza-codigo-morto.ps1` | Script de exclusão de código morto (criado) | Ver seção 2 |

> ⚠️ Validar com `cd frontend && npm run build` e `python -c "from server import app"` (no backend) antes do deploy.

---

## 2. Código morto / lixo — rodar `limpeza-codigo-morto.ps1`

Tudo verificado por grep (zero referências externas). Recuperável via git.

**Backend (4 arquivos):** `database.py` (shim nunca importado), `database_supabase.py` (355 linhas mortas, com URL hardcoded do projeto **errado** `otyrrvkixegiqsthmaaj`), `migrations/migrate_to_supabase.py` e `run_migration_supabase.py` (one-offs já executados).

**Frontend (28 arquivos):** componentes nunca importados (`BrowserCheck`, `NotificationPermissionModal`, `CameraPermissionGuide`, `LocationPermissionGuide`), 23 componentes shadcn/ui órfãos (o app usa `sonner` direto para toasts — o cluster `toast`/`toaster`/`use-toast` é morto; `command.jsx` fica, pois `combobox` depende dele) e `hooks/use-toast.js`.

**Artefatos:** `test_reports/` (5 JSONs de um harness antigo), `test_result.md`.

**Lixo local (só disco, gitignorado):** `.claude\worktrees\` contém **4 cópias completas do repositório** — provavelmente é isso que está lotando seu disco (inclusive impediu o ambiente de execução desta sessão). `frontend\build\` é output de build local.

### Decisão de negócio pendente (NÃO deletado)
Módulo de **gamificação** está desabilitado desde 2026-05-15 mas os arquivos existem: `routes/gamification.py` (~800 linhas), `services/gamification.py`, `pages/LojaFaixaPreta.jsx`, `pages/GamificationReport.jsx`, `GamificationWidget/Highlight`, `WeeklyLeaderboard`, `CoinAnimation`. **Se a desativação for definitiva, deletar tudo** (recupera-se via git); se for temporária, manter.

---

## 3. Instabilidades encontradas (corrigir em seguida)

### Prioridade ALTA
1. **Migrations 038 e 039 não rodadas no Supabase** — o throttle de brute-force (`login_attempts`) está *fail-open* (inativo) e o `$inc` usa fallback não-atômico. **É só rodar os 2 SQLs no painel do Supabase** (projeto `qfsxtwkltfraounsjjah`). Junto: setar `REACT_APP_VISUAL_CONNECT_URL/_KEY` e `INLINE_RUNTIME_CHUNK=false` na Vercel (pendências do `CLAUDE.md`).
2. **`update_many` atualiza só 1 registro** (`db_supabase.py:541` delega para `update_one`; idem `delete_many`→`delete_one`). Funciona por acaso nos callers atuais. Implementar de verdade ou renomear para deixar a limitação explícita.
3. **OAuth Google callback sem validação do `state`** (`routes/calendar.py:~145`) — o HMAC de `state` é gerado mas aparentemente não verificado antes do exchange do `code` (CSRF). Confirmar e corrigir.

### Prioridade MÉDIA
4. `requests.post` síncrono dentro de `async def google_callback` (bloqueia event loop) — trocar por `httpx` ou tornar a rota `def`.
5. Rota duplicada de reset de senha: `auth_new.py:612` **e** `users.py` — manter uma só (a de `users.py` agora valida força, mas a duplicação confunde).
6. `UpdateNotification.jsx:21-40` — listeners do Service Worker (`updatefound`, `statechange`, `controllerchange`) sem cleanup no `useEffect`.
7. 96 `console.error/warn` em 32 arquivos do frontend — centralizar num helper de logging (e futuramente Sentry) para não vazar detalhes de API no console de produção.

---

## 4. Performance — para o sistema ficar mais rápido

Ordenado por impacto/esforço:

1. **Rodar a migration 039** (`increment_field`) — além de corrigir a race condition, elimina o read-then-write (2 round-trips → 1) em cada incremento.
2. **Backfill de fotos base64 legadas → Supabase Storage.** Checkins antigos ainda carregam strings base64 de 100–750KB que: (a) incham as respostas da API, (b) ficam no DOM (`JobDetail.jsx:2068/2349`, `UnifiedReports.jsx:1051`). Script one-off: ler registros com `checkin_photo`/`checkout_photo` preenchidos, subir pro bucket `checkin-photos`, gravar `photo_url`, limpar o base64. **Maior ganho individual de velocidade percebida.**
3. **Adotar a paginação opt-in do backend (M7) no frontend** — as rotas de `/reports/*` fazem `find()` sem limite em `jobs`, `item_checkins` e `installers` (ex.: `reports.py:530-532, 885-886`); com o crescimento do banco vão estourar o timeout de 60s da Vercel.
4. **N+1 / O(n³) em `/reports/by-installer`** (`reports.py:413+`): triplo loop aninhado filtrando listas em memória. Pré-indexar com dicts (`checkins_by_installer`, depois `by_job_id`) → O(n).
5. **`React.memo` nos cards de lista** (`Jobs.jsx` JobCard, cards de visita em `VisitasTecnicas.jsx`) — com 200+ jobs, qualquer estado local re-renderiza a lista inteira.
6. **Unificar `api.getJob` (com cache) vs `api.getJobById` (sem cache)** (`api.js:203` vs `372`) — mesmo endpoint, dois nomes; quem usa o errado perde o cache.
7. `loading="lazy"` + `decoding="async"` nas `<img>` de `JobDetail.jsx` e `UnifiedReports.jsx` (o padrão já existe em `InstallerJobDetail.jsx:760` — replicar).

---

## 5. Código mais limpo e fácil de alterar (refatorações estruturais)

1. **Quebrar os arquivos gigantes** (maior alavanca de manutenibilidade):
   - `pages/JobDetail.jsx` (**2.668 linhas**) → extrair `JobCheckinsSection`, `JobPhotosGallery`, dialogs de agendamento/arquivamento
   - `routes/jobs.py` (**~2.250 linhas**) → separar sync Holdprint, agendamento e CRUD
   - `pages/VisitasTecnicas.jsx` (1.462) → extrair os modais inline
   - `pages/UnifiedReports.jsx` (1.296) → um componente por tab
   - `routes/item_checkins.py` (1.200) → extrair helpers de EXIF/fuso para `services/exif.py`
2. **Uma única `classify_product_to_family`** — hoje existem **3 implementações divergentes** (`reports.py:71`, `jobs.py:118`, `services/product_classifier.py:8`); a classificação pode divergir conforme o caminho executado. Consolidar em `services/product_classifier.py` e importar nas rotas.
3. **Adotar (ou apagar) os hooks órfãos** `useGpsMachine`, `useConfirmDialog`, `useApiCall`, `useJobs` — foram criados para refatorar `InstallerJobDetail.jsx` e nunca usados. Decidir: migrar o InstallerJobDetail para eles, ou deletar.
4. **Compressão de imagem duplicada** — `JobDetail.jsx:320-355` reimplementa inline o que existe em `lib/compressImage.js`. Usar a lib.
5. Atualizar o **`CLAUDE.md`**: ARCH-002 diz "JWT 1 dia no backend" mas o código usa 7 dias; PENDING-001/005 já foram corrigidos no código (faltam só as migrations); registrar a decisão sobre gamificação.
6. Rotacionar o **token Vercel e n8n JWT** expostos (dívida de segurança registrada no CLAUDE.md, prazo era 24h em 14/05).

---

## 6. Últimas alterações (contexto do reflog)

Ritmo intenso de 05–08/06: reescrita do fluxo do instalador (multi-foto + EXIF), horários de relatório passaram a vir **somente** do EXIF da foto, série de hotfixes de fuso horário (3 commits seguidos), HEIC→JPEG (4 tentativas até estabilizar com `exifr` + `pillow-heif`), correções de ChunkLoadError/Service Worker no mobile, e hardening de segurança M1–M5. Padrão observado: vários "fix do fix" em EXIF/fuso e cache do SW — são as duas áreas mais frágeis do sistema hoje; os testes manuais pós-deploy devem sempre cobrir: foto da galeria com EXIF, fuso exibido, e atualização de versão no mobile.

---

## 7. Ordem de execução sugerida

1. Rodar `limpeza-codigo-morto.ps1` + commitar edits desta sessão + `npm run build` para validar (30 min)
2. Rodar migrations 038/039 no Supabase + envs na Vercel (15 min)
3. Corrigir validação do `state` no OAuth callback (1h)
4. Backfill de fotos base64 → Storage (meio dia)
5. Implementar `update_many` real (2h)
6. Paginação nos reports + fix O(n³) by-installer (1 dia)
7. Split do JobDetail.jsx e jobs.py (contínuo, 1 arquivo por sprint)
8. Decisão sobre gamificação → deletar ou reativar
