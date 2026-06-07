# Auditoria Pré-Produção — Status / Memória de Retomada

> Arquivo de memória para retomar a auditoria em sessões futuras.
> Relatório completo (com código antes/depois): `AUDITORIA-PRE-PRODUCAO.md`
> Plano de melhoria por dimensão (8 critérios + ordem de execução): `PLANO-DE-MELHORIA.md`
> Última atualização: 05/06/2026
> Achados novos da análise por dimensão: ZERO testes no projeto (maior lacuna estrutural); sanitização ok (sem dangerouslySetInnerHTML/eval; Pydantic no backend).

## Resumo do veredito
Projeto estruturalmente bom (já tem Error Boundary global, lazy loading, CORS correto). **Ainda não 100% pronto para produção** apenas pelo bloqueador B1 (já corrigido no código, falta rodar a migration). Frente de segurança para go-live concluída.

---

## ✅ JÁ FEITO (corrigido no código)

### B1 — Conta de instalador vulnerável a invasão  🔴
- **Senha forte:** validador `validar_forca_senha()` (>=8, letra+número) aplicado nos 5 fluxos de `backend/routes/auth_new.py` (register, admin_register, reset-password, change-password, admin reset).
- **Rate limiting:** throttle por conta (5 tentativas / 15 min → HTTP 429), DB-backed, fail-open. Lógica em `auth_new.py` (`_login_attempts_recentes`, `_registrar_tentativa_falha`, `_limpar_tentativas`, integrado no `login()`). Registry em `db_supabase.py` (`login_attempts`).
- ⚠️ **PENDENTE MANUAL:** rodar `backend/migrations/038_login_attempts.sql` no Supabase (projeto `qfsxtwkltfraounsjjah`). Sem isso o throttle fica inativo (login funciona normal — fail-open).

### M1 — Credencial/URL fixa no frontend  🟡
- `frontend/src/pages/InstallerJobDetail.jsx`: trocado por `REACT_APP_VISUAL_CONNECT_URL` / `REACT_APP_VISUAL_CONNECT_KEY` (pula a chamada se não configurado). Documentado em `frontend/.env.example`.
- ⚠️ **PENDENTE MANUAL:** setar essas 2 envs na Vercel (e `.env` local) com os valores do projeto somos-industriavisual.

### M2 — Enumeração de e-mail no forgot-password  🟡
- `backend/routes/auth_new.py`: resposta sempre idêntica (removidos `email_sent`/`error_type`). Frontend `ForgotPassword.jsx` simplificado para sempre mostrar sucesso.

### M3 — Cron disparável por qualquer um  🟡
- `backend/server.py`: exige sempre `Authorization: Bearer <CRON_SECRET>` (fail-closed). Confirmado compatível com Vercel Cron (docs oficiais).

### M5 — Erros silenciosos nos catálogos  🟡
- `frontend/src/hooks/useCatalogos.js`: reescrito com `loading`/`error`, toast de falha, Promise.allSettled e proteção contra race no unmount.

### M6 — Falha do Google Calendar sem aviso  🟡
- `frontend/src/pages/Calendar.jsx`: `toast.error` no catch de `checkGoogleStatus`.

---

## ⏳ PENDENTE (próximas sessões — ordem do plano)

### Ainda faltam 🟡 (deve corrigir):
- ✅ **M7/P2 FEITO (backend)** — `list_jobs` agora tem paginação opt-in (`?page=&page_size=`, sort created_at desc) + teto de segurança de 1000 sem paginação (loga warning ao atingir). Caminho instalador usa `.range()`. **Próximo passo:** frontend (`useJobs`/Jobs.jsx) adotar `?page=` com "carregar mais".
- ✅ **P1-A FEITO** — CSP adicionada em `frontend/vercel.json` em modo **Report-Only** (zero risco de quebra). **Para ativar enforcing:** (1) setar `INLINE_RUNTIME_CHUNK=false` na Vercel (CRA embute script inline no index.html — documentado no .env.example), (2) acompanhar console do navegador por alguns dias, (3) renomear o header para `Content-Security-Policy`.
- **M8** — Token JWT em localStorage (`tokenManager.js`). Fix: cookie HttpOnly ou CSP.
- **M9** — Error Boundary só global (`App.js:3-29`). Fix: boundaries por rota + botão retry + log remoto.

### Melhorias 🟢 (pós-deploy — Tarefa 6):
- **R1** Sem tipagem (adotar TS gradual ou PropTypes/JSDoc).
- **R2** Arquivos gigantes: `jobs.py` (2100+), `Checkins.jsx` (735), `auth_new.py`.
- **R3** Listas sem `React.memo`/`useCallback` (`Checkins.jsx` → MiniCheckinCard).
- **R4** Magic numbers (4h atraso, 768px, 1024 img, 500m) → constantes.
- **R5** Código morto/comentado da gamificação + arquivos órfãos (LojaFaixaPreta.jsx, GamificationReport.jsx).
- **R6** Duplicação: `compress_base64_image` (checkins.py + item_checkins.py); paginação Holdprint (jobs.py + services).
- **R7** CORS `allow_methods=["*"]` → restringir aos métodos usados.

### Observação extra (achada na verificação, não no relatório original):
- `cs_integration.py:19-20` e `database_supabase.py:19` têm URLs do projeto otyrrvkixegiqsthmaaj fixas no backend (URLs, não chaves — só organização).

### Caça a bugs (sessão 05/06/2026) — achados na camada de banco (`db_supabase.py`):
- ✅ **CORRIGIDO — `find()`/`find_one()` engoliam erros:** capturavam qualquer exceção e retornavam `[]`/`None`, mascarando erros reais de query (coluna/RLS/conexão) como "sem dados". Agora propagam a exceção (resultado vazio legítimo não lança). ⚠️ **Atenção no deploy:** pode revelar erros latentes pré-existentes como 500 — é o comportamento desejado, mas TESTAR antes de subir.
- ✅ **CORRIGIDO — landmine no `update_one` + M4 ($inc atômico):** `update_one` reestruturado (operadores `$set`/`$inc`/`$push` independentes — não mais `if/elif`, então `$set`+`$inc` juntos funcionam). `$inc` agora usa RPC atômica `increment_field` (migration `039_increment_field_atomic.sql`), com fallback read-then-write se a RPC não existir (deploy não-quebrável). Helper `_apply_inc_atomico` em `db_supabase.py`. ⚠️ **PENDENTE MANUAL:** rodar `migrations/039_increment_field_atomic.sql` no Supabase para ativar a atomicidade (sem ela, cai no fallback antigo — não quebra).
- Nenhum bug ativo de crash encontrado: `detect_product_family` sempre awaited; `add_coins` (async) não é chamada por rotas (gamificação off) — PENDING-002 do CLAUDE.md está, na prática, dormente.

---

## Verificações ainda não feitas (sandbox estava fora — disco cheio)
- [ ] `python -c "from server import app"` (backend importa limpo)
- [ ] `npm run build` no frontend
- [ ] Testar throttle após rodar a migration 038

## Falsos positivos já descartados (NÃO mexer — estão corretos)
- Resend já tem try/except (`auth_new.py`).
- CORS NÃO é wildcard (server.py falha-rápido + lista explícita; ARCH-004 do CLAUDE.md está desatualizado).
- Error Boundary global existe (App.js).
- `/integration/schedule` protegido por `_verify_key`.
