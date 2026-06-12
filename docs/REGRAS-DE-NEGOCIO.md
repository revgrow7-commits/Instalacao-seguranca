# Regras de Negócio — instal-visual.com.br (fonte canônica)

> **Para agentes (Claude Code etc.):** este arquivo é leitura OBRIGATÓRIA antes de qualquer alteração de código. Cada regra tem o arquivo onde está implementada — ao mudar comportamento, atualize a regra aqui no MESMO commit. Se o código e este documento divergirem, PARE e pergunte ao usuário qual é o correto.

## 1. Papéis e permissões
- 3 roles: `admin`, `manager`, `installer` (`models/user.py`). Role é normalizado para minúsculas no `get_current_user` (`security.py`).
- Instalador SÓ vê os próprios jobs/checkins; telas de gestão (`/jobs`, `/checkins`, `/reports`, `/calendar`) são admin+manager; `/users` e `/admin/scheduler` são admin.
- Instalador que acessa `/jobs/:id` é redirecionado para `/installer/job/:id` (App.js).
- Toda rota backend exige `Depends(get_current_user)`; ações destrutivas exigem `require_role`. Exceções públicas intencionais: login, register, self-register, forgot/reset-password, verify-reset-token, vapid-public-key, callbacks OAuth, cron (protegido por `x-vercel-cron`/CRON_SECRET) e integração (X-Integration-Key).

## 2. Ciclo de vida do job
- Origem: importado do ERP **Holdprint** (sync manual via `/integration` ou cron diário 06:00 BRT `/api/cron/sync-holdprint`) ou criado manualmente.
- Fluxo de status: AGUARDANDO → agendado (data + instaladores) → INSTALANDO (1ª foto de início) → concluído/finalizado. Jobs em **qualquer status, incluindo `finalizado`**, podem ser REAGENDADOS — o reagendamento sempre devolve o job para `agendado` (com histórico auditável + nota), independente do status das fotos de início/conclusão do item. `jobs.status` só aceita os valores do CHECK constraint `jobs_status_check`: aguardando, agendado, instalando, pausado, finalizado, atrasado, arquivado, justificado.
- Soft-delete: job excluído no Relatório Consolidado é arquivado, não apagado.
- Itens (produtos) do job podem ser arquivados individualmente; item arquivado **bloqueia novo registro de início** mas **NÃO bloqueia registro de conclusão** de trabalho já iniciado (regra M9 relaxada — instalador em campo nunca pode ficar travado; loga warning).

## 3. Registro de início e conclusão em campo (regra mais crítica do sistema)

> **Não existem mais botões de "check-in" e "checkout".** O instalador usa dois botões de upload de galeria: **"Registrar Início"** e **"Registrar Conclusão"**. Todo o horário e GPS oficial vêm do EXIF da foto selecionada.

- O instalador registra o trabalho **DEPOIS da obra** (às vezes outro dia). Por isso o horário OFICIAL de início/fim **vem SEMPRE do EXIF da foto da galeria** (DateTimeOriginal), NUNCA do momento do upload.
- **Fluxo do instalador:**
  1. Botão **"Registrar Início"** → abre galeria → instalador seleciona foto(s) de início → sistema extrai DateTimeOriginal e GPS do EXIF → registra como início do serviço.
  2. Botão **"Registrar Conclusão"** → abre galeria → instalador seleciona foto(s) de conclusão → sistema extrai DateTimeOriginal e GPS do EXIF → registra como conclusão do serviço.
- **Convenção de fuso (inegociável):** EXIF sem offset = relógio de parede em **BRT (America/Sao_Paulo, UTC-3)**. Nunca carimbar naive como UTC. Helpers canônicos: `_parse_exif_local`/`_offset_to_tz` (backend `item_checkins.py`) e `exifTimeHM` (`frontend/src/lib/exifTime.js`, timeZone fixo). Qualquer código novo de data/hora DEVE usar esses helpers.
- Única validação de timeline: foto(s) de conclusão não podem ter EXIF anterior ao EXIF de início. Não bloquear por intervalo de upload.
- Registro duplicado de início no mesmo item dentro de 5 min = idempotente (retorna o existente); fora disso, 409.
- Fotos: múltiplas por registro (máx. 10), galeria do celular, HEIC convertido/aceito (exifr + pillow-heif). Foto **SEM data EXIF é recusada** — o horário oficial depende dela.
- Upload: base64 → comprimido (~300KB, 1200px) → Supabase Storage bucket `checkin-photos` → URL pública no banco; base64 no banco só como fallback se o Storage falhar.
- **GPS:** vem exclusivamente do EXIF da foto (`exif_lat/long`). Não há mais captura de localização pelo dispositivo no momento do upload. Conclusão com GPS a mais de **500 m** do GPS de início (`MAX_CHECKOUT_DISTANCE_METERS`, config.py) gera registro em `location_alerts` — alerta, não bloqueio.
- **Sem duração mínima:** o tempo é 100% EXIF (registro feito depois da obra). NÃO há piso de 60 s — a única validação temporal é fim ≥ início (EXIF). (`MIN_CHECKOUT_DURATION_SECONDS` ficou deprecado/sem uso.)
- **Pausar/Retomar removido** do fluxo do instalador: como a duração vem do EXIF das fotos, a pausa não tinha efeito no tempo oficial. Itens legados em `paused` são tratados como em andamento.

## 4. Relatórios
- Início/fim/duração vêm **SOMENTE do EXIF** (`_exif_start/_exif_end/_exif_duration_min` em `reports.py`). Sem EXIF de data → registro fica sem timeline (nunca usar horário de upload como fallback).
- `_parse_dt` assume **BRT** para strings naive (alinhado à gravação). Filtros de data no frontend usam fuso fixo `-03:00` (UnifiedReports).
- Produtividade: m² instalado / horas EXIF, agrupado por instalador e por família de produto.
- Famílias de produto: classificação por keywords (adesivos, lonas, acm, painéis, outros). ⚠️ Existem 3 implementações divergentes (`reports.py`, `jobs.py`, `services/product_classifier.py`) — consolidar é melhoria futura; ao mexer, não criar uma 4ª.
- Relatórios carregam tudo sem paginação (aceito por ora; risco de timeout 60s da Vercel com crescimento — paginação opt-in já existe no backend, adoção é melhoria futura).

## 5. Autenticação e segurança
- JWT HS256, expiração **7 dias** (backend `config.py` e frontend `tokenManager.js`, alinhados).
- Senha: mínimo **8 caracteres com letra e número** (`validar_forca_senha`, em TODOS os fluxos de senha).
- Throttle de brute-force via tabela `login_attempts` — **só ativo após migration 038 no Supabase** (sem ela, fail-open).
- `$inc` atômico via RPC `increment_field` — **só ativo após migration 039** (sem ela, fallback read-then-write).
- OAuth Google: `state` HMAC validado ANTES do exchange do code.
- Anti-enumeração: forgot-password responde igual para email existente/inexistente.

## 6. Banco (Supabase via wrapper MongoDB-like)
- Projeto: `qfsxtwkltfraounsjjah`. **NUNCA** rodar SQL no `otyrrvkixegiqsthmaaj` (outro site).
- Todo acesso via `db_supabase.py` (sintaxe Mongo). Coluna nova no banco ⇒ adicionar em `TABLE_COLUMNS`, senão `_filter_columns()` descarta o campo em silêncio.
- JSONB (`items`, `holdprint_data`, `products_with_area`...) é nativo — sem json.dumps/loads.
- Tabelas `gamification_*`, `coin_transactions`, `rewards`, `reward_requests`: histórico morto — **gamificação foi REMOVIDA do produto em 2026-06-11**. Não reintroduzir referências.

## 7. Frontend / PWA / Deploy
- Mobile-first para instalador (BottomNav); desktop para gestão (Sidebar). Dark mode, destaque `#e94560`/`#FF1F5A`. Idioma: PT-BR.
- Cache do `api.js`: toda MUTAÇÃO deve invalidar o cache correspondente (`clearCache`/`clearJobsCache`). Função nova de leitura com cache ⇒ função de escrita correspondente invalida.
- Service Worker `service-worker.js` (CACHE_VERSION v8): navegação network-first (só cacheia 200), `/static/` cache-first com `cache:'reload'` na 1ª baixa. `sw.js` separado é só push. Sentinel no `index.html` (token `iv_clear`) limpa caches 1x por versão e **PRESERVA a querystring** (`?token=` do reset de senha).
- `REACT_APP_*` é baked at build time — mudar env exige redeploy. **`REACT_APP_BACKEND_URL` = `https://backend-henna-one-82.vercel.app/_/backend`** (o domínio instal-visual.com.br é frontend-only; ver MEMORIA-INSTABILIDADE.md antes de tocar nisso).
- Deploys: frontend = projeto `instalacao-seguranca` (link na raiz), backend = projeto próprio (link em `backend/`). Deploy às vezes reusa build velho — validar com curl que a mudança está no ar; usar `--force` se preciso.

## 8. Integrações
- Holdprint: 2 chaves (POA e SP). Visual Connect: URL/KEY via env `REACT_APP_VISUAL_CONNECT_*`; chamada é fire-and-forget (falha não pode quebrar a tela do instalador).
- Resend (reset de senha), Google Calendar OAuth (gestores e instaladores), Web Push VAPID.
- Visitas técnicas (VT): módulo paralelo com ciclo próprio (agendar → confirmar → relatório), catálogos de vendedores/tipos de serviço/ferramentas.
