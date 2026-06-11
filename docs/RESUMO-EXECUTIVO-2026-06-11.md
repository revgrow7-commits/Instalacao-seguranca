# Resumo Executivo — Saneamento do Sistema (11/06/2026)

## 1. O que foi entregue hoje

**Limpeza e simplificação**
- Gamificação **removida por completo** (commit `ab6f3bf`): 3 módulos backend (rotas ~800 linhas, services, models), 6 componentes/páginas frontend, feature flags, itens de menu e chamadas de API. As 4 tabelas no banco (`gamification_balances`, `coin_transactions`, `rewards`, `reward_requests`) foram mantidas como histórico — sem uso no código.
- Código morto eliminado (commit `c59b9c3`, sessão da manhã): ~4.000 linhas — `database.py`/`database_supabase.py` órfãos, 23 componentes shadcn/ui sem uso, cluster toast/toaster, scripts one-off, `test_reports/`.
- Arquivos-lixo de comandos malformados apagados (2 rodadas, ~24 arquivos).

**Estabilidade**
- Política de senha unificada (8+ chars, letra e número) em todos os fluxos.
- OAuth Google: validação de `state` HMAC antes do exchange (CSRF).
- `update_many`/`delete_many` reais no wrapper do banco.
- Sentinel do `index.html` preserva querystring — **link de reset de senha voltou a funcionar** no 1º acesso.
- Service Worker: origin check estrito, não cacheia resposta de erro, `cache:'reload'` contra chunk corrompido.
- Race conditions: Dashboard com guard de unmount, listeners do SW com cleanup.
- 3 `except: pass` em validações de checkout agora logam.

**Metadados de fotos (EXIF) — pipeline corrigido (commit `b3dc310`)**
- Validação "foto de conclusão anterior ao início" usava UTC de um lado e BRT do outro (erro de ±3h) → agora usa o mesmo helper `_parse_exif_local` em todo o fluxo.
- `_parse_dt` dos relatórios carimbava UTC em horários sem fuso → agora BRT, alinhado com a gravação.
- Tela do instalador exibia horário no fuso do celular → agora `exifTimeHM` com `America/Sao_Paulo` fixo.
- `CheckinViewer` lia a variável `checkin` antes de declará-la (TDZ) → horários EXIF saíam vazios; corrigido.
- Filtro de data dos relatórios interpretava bordas do dia diferente por browser → fuso BRT fixado.

**Performance**
- `/reports/by-installer` de O(n³) → O(n); cache de `product_families` (1 query a menos por check-in); `getJob` unificado com cache; `React.memo` + `useCallback` nos cards; `loading="lazy"` nas fotos; carregamento em 2 fases no Dashboard/Reports.

**Documentação**
- `/docs/business/produto.md`, `/docs/architecture/arquitetura.md`, `/docs/ux/fluxos.md` criados.

## 2. Arquitetura final (inalterada na essência, enxugada)
React 18 CRA (PWA) na Vercel (`instalacao-seguranca`) + FastAPI serverless (`backend-henna-one-82/_/backend`) + Supabase PostgreSQL (`qfsxtwkltfraounsjjah`). 17 routers de API, 3 roles (admin/manager/installer), integrações Holdprint, Google Calendar, Resend e Web Push.

## 3. Pendências manuais (NÃO automatizáveis daqui)
1. **Supabase**: rodar migrations `038_login_attempts.sql` (throttle de brute-force está inativo sem ela) e `039_increment_field_atomic.sql` ($inc atômico).
2. **Vercel**: setar `REACT_APP_VISUAL_CONNECT_URL`/`_KEY` e `INLINE_RUNTIME_CHUNK=false`.
3. **Rotacionar** token Vercel e n8n JWT expostos (pendente desde 14/05).
4. (Opcional) Dropar as 4 tabelas de gamificação quando tiver certeza de que o histórico não interessa.

## 4. Melhorias futuras recomendadas (em ordem)
1. Backfill das fotos base64 legadas → Supabase Storage (maior ganho de velocidade percebida restante).
2. Paginação nos `/reports/*` (hoje sem limite; risco de timeout 60s conforme o banco cresce).
3. Unificar as 3 implementações divergentes de `classify_product_to_family` (reports.py, jobs.py, services/product_classifier.py) — hoje a classificação pode divergir por caminho.
4. Quebrar arquivos gigantes: `JobDetail.jsx` (2.668 linhas), `jobs.py` (~2.250), `VisitasTecnicas.jsx`, `UnifiedReports.jsx`.
5. Centralizar logging do frontend (96 `console.*`) num helper/Sentry.
6. Alertas de "atraso" do Dashboard usam horário do clique — revisar regra de negócio (instalador registra depois da obra).

## 5. Commits de hoje (cronológico)
`9431cae` sentinel v7 → `ddc8469` correções auditoria → `c59b9c3` código morto → `29a70d9` OAuth state → `a59a97f` update_many real → `1997e55` rota duplicada → `ebd9661` oauth sync → `abc8f4c` SW listeners → `414ad7a` reports O(n) → `5233209` getJob cache → `b6ec327` JobCard memo → `0650f4d` img lazy → `633cad1` docs → `34a62c3` SW v8 cache-first → `5f843c5` cache reload → `561e997` sentinel querystring → `ab6f3bf` **remove gamificação** → `b3dc310` **fixes EXIF/relatórios**
