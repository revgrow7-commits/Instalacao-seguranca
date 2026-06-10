# Auditoria DBA — instal-visual.com.br

**Data:** 2026-06-07 · **Escopo:** Supabase `qfsxtwkltfraounsjjah` + backend FastAPI
**Método:** análise estática do código e migrations (001–039). O conector Supabase MCP não tinha acesso ao projeto, então as métricas ao vivo (pg_stat_statements, tamanhos reais) devem ser coletadas com o script `db-diagnostico-dba.sql` na raiz do projeto.

---

## PASSO 1 — DIAGNÓSTICO

### 1.1 Estrutura & Schema

**Visão geral:** 28 tabelas em `public`, PKs em TEXT (UUIDs gerados na aplicação), uso pesado de JSONB (`jobs.items`, `holdprint_data`, `products_with_area`, `assigned_installers`). O backend acessa tudo via wrapper MongoDB-like sobre PostgREST (`db_supabase.py`) — sem joins SQL, sem transações, sem agregação no banco (exceto as RPCs de `visitas_reports`).

**Relacionamentos principais:**

```
users ─┬─ installers (id = user_id pós-033)
       │    ├─ item_checkins ─┬─ item_pause_logs (CASCADE)
       │    │                 ├─ installed_products (CASCADE)
       │    │                 └─ item_checkin_photos (SEM FK ❌)
       │    ├─ visitas_tecnicas
       │    └─ productivity_history
       ├─ gamification_balances / coin_transactions / reward_requests
       └─ push_subscriptions / google_tokens / password_resets

jobs ─┬─ item_checkins (CASCADE)
      ├─ checkins (legado)
      ├─ job_justifications / location_alerts / visitas_tecnicas
      └─ job_photos (SEM FK ❌)
```

**Problemas de schema, por gravidade:**

🔴 **Integridade**

| # | Problema | Onde | Impacto |
|---|---|---|---|
| S1 | `job_photos.job_id` e `uploaded_by` **sem FK** | migration 035 | Linhas órfãs; delete de job não limpa fotos |
| S2 | `item_checkin_photos.checkin_id/job_id/installer_id` **sem FK** | migration 037 | Idem |
| S3 | `coin_transactions.user_id` com `ON DELETE CASCADE` | 001/002 | Deletar usuário apaga trilha de auditoria financeira (moedas) |
| S4 | `visitas_tecnicas.status` sem CHECK | 012 | TEXT livre — typo cria estado fantasma invisível nos filtros |
| S5 | Filtro `{"archived": {"$ne": True}}` vira `archived <> true` no PostgREST | reports.py, jobs.py | **Linhas com `archived IS NULL` são EXCLUÍDAS** (NULL ≠ true é NULL em SQL). Jobs antigos sem o campo podem sumir de métricas |

🟡 **Tipos e duplicação**

| # | Problema | Onde |
|---|---|---|
| S6 | `productivity_history.date` é TEXT (YYYY-MM-DD), não DATE | 031 |
| S7 | GPS: `location_alerts` usa NUMERIC(10,7); `item_checkins` usa DOUBLE PRECISION | 001/002 |
| S8 | `duration_minutes`: NUMERIC(10,2) em item_checkins, DOUBLE PRECISION em checkins | 007 parcial |
| S9 | `gamification_balances.level` vs `current_level` (duplicadas, semânticas diferentes) | conhecido (PENDING-003) |
| S10 | `product_name`/`family_name` desnormalizados em 2 tabelas sem FK para `product_families` | 001 |

### 1.2 Performance de Queries — os ofensores reais

Sem acesso ao `pg_stat_statements` ao vivo, a análise estática já identifica com alta confiança onde o tempo está sendo gasto. **O padrão dominante não é "query lenta no Postgres" — é o backend baixando tabelas inteiras via PostgREST e agregando em Python.**

🔴 **Crítico — full scan + agregação em Python (latência 5–15s projetada com volume)**

| # | Endpoint | Arquivo | Padrão |
|---|---|---|---|
| Q1 | `GET /reports/productivity` | reports.py ~476 | `jobs.find({})` + `item_checkins.find({status})` + `installers.find({})` + `checkins.find({status})` — 4 tabelas inteiras na memória, filtro de `is_archived` e datas em Python |
| Q2 | `GET /reports/by-family` | reports.py ~114 | `jobs.find({})` inteiro só para re-parsear `holdprint_data.products` (JSONB de 50–200KB/linha) e classificar família em Python |
| Q3 | `GET /reports/by-installer` | reports.py ~362 | O(N×M): para cada instalador, list-comprehension sobre TODOS os item_checkins. 100 instaladores × 50k checkins = 5M comparações |
| Q4 | `GET /reports/kpis/family-productivity` | reports.py ~262 | Desvio padrão, variância, min/max calculados em Python sobre todas as linhas |
| Q5 | `GET /metrics` | reports.py ~785 | `checkins.find({})` e `item_checkins.find({})` inteiros; `is_archived` filtrado em Python (o índice nunca é usado) |

🔴 **Crítico — escrita em loop**

| # | Onde | Padrão |
|---|---|---|
| Q6 | `sync_holdprint.py` ~125–155 | `insert_one` por job dentro do loop de páginas. 100 jobs × 10 páginas = 1.000+ roundtrips HTTP no cron diário. Trocar por `insert_many` por página (já existe no wrapper) |

🟠 **Alto — N+1 e full scans auxiliares**

| # | Onde | Padrão |
|---|---|---|
| Q7 | `item_checkins.py` `_get_enrichment_maps()` ~72 | Full scan de `jobs` + `installers` a cada 30s de TTL para enriquecer listagens. Projeção ok, mas TTL curto demais sob carga |
| Q8 | `visitas.py` `_enrich_installer_name()` ~58 | `find_one` por instalador não-cacheado, dentro de list comprehension — N+1 clássico (até 50 queries num export Excel) |
| Q9 | `jobs.py list_jobs()` ~396 | Busca TODOS `item_checkins in_progress` e filtra `job_id in job_ids` em Python — o filtro `$in` existe no wrapper e há índice composto `(job_id, status)` pronto, não usado |
| Q10 | `jobs.py list_jobs()` projeção ~330 | `holdprint_data: 1` traz o JSONB inteiro para depois manter 5 campos. 1000 jobs ≈ 50–100MB de payload PostgREST descartado |
| Q11 | `security.py get_current_user()` :59 | 1 query em `users` por request autenticada, sem cache. É a query mais executada do sistema inteiro |

✅ **O que já está certo:** `visitas_reports.py` delega agregação para RPCs SQL (modelo a copiar); `/location-alerts` usa bulk fetch `$in`; idempotência de check-in bem feita; `$inc` já tenta RPC atômica (M4) com fallback.

### 1.3 Estratégia de Indexação — avaliação

**Existem ~73 índices** (001, 003, 005, 011, 012, 013, 016, 017, 031, 035, 037, 038). A cobertura para filtros simples é boa. Os gaps reais:

| # | Gap | Justificativa |
|---|---|---|
| I1 | Nenhum índice parcial `WHERE is_archived IS NOT TRUE` em `item_checkins`/`checkins` | Todo report filtra arquivados — hoje em Python; quando mover para SQL, esse índice é o que importa |
| I2 | `item_checkins.checkin_at DESC` sem índice | `GET /item-checkins/all` ordena por `checkin_at DESC` com paginação — sem índice é sort de tabela inteira a cada página |
| I3 | `coin_transactions.reference_id` sem índice | Lookups de idempotência/auditoria por referência polimórfica |
| I4 | `visitas_tecnicas.created_at` sem índice | Listagem padrão ordena `created_at DESC` |
| I5 | `idx_jobs_archived` é índice cheio em coluna booleana de baixa seletividade | Substituir por parcial `WHERE archived IS NOT TRUE` (menor, mais usado) |
| I6 | Suspeitos de redundância: `idx_productivity_history_installer_date` (003) vs `idx_productivity_history_installer` (031); índices single-column de 012/013 cobertos pelos compostos de 017 | **Não dropar às cegas** — confirmar com `pg_stat_user_indexes` (script de diagnóstico, seção 4) |

**Importante:** índice nenhum ajuda enquanto o código filtrar em Python. A ordem certa é: corrigir as queries (Q1–Q9) → criar os índices que as novas queries usam → medir → dropar os mortos.

### 1.4 Métricas de Carga — perfil estimado e como medir

**Perfil de acesso (pelo domínio):**

- **Leitura ≈ 80–90%**: dashboards admin/manager, listagens de jobs, relatórios, calendário, polling de gamificação no frontend.
- **Escrita ≈ 10–20%** em dois padrões distintos:
  - *Pico batch*: cron Holdprint às 06:00 BRT (hoje em insert-loop — Q6).
  - *Gotejamento de campo*: check-ins/checkouts de instaladores durante horário comercial, com fotos (upload Storage + 2–4 writes por evento).
- **Tabelas quentes (leitura):** `jobs`, `item_checkins`, `users` (via get_current_user), `installers`.
- **Tabelas quentes (escrita):** `item_checkins`, `jobs` (status), `coin_transactions`/`gamification_balances` (quando reativado), `location_alerts`.
- **Crescimento:** `item_checkins` e `*_photos` são as séries que crescem sem teto; `jobs` cresce com o volume do Holdprint. JSONB em `jobs` é o maior consumidor de disco por linha.

**Requisito de consistência:** escritas de campo precisam de consistência forte (check-in/checkout, anti-fraude GPS). Relatórios toleram defasagem de minutos → candidatos perfeitos a cache/visões materializadas.

**Para medir de verdade:** rode `db-diagnostico-dba.sql` (raiz do projeto) no SQL Editor — ele cobre tamanhos, contagens, slow queries, índices não usados, cache hit ratio e seq scans. Sem isso, qualquer número de volume é chute.

---

## PASSO 2 — PLANO DE INFRAESTRUTURA E OTIMIZAÇÃO

### 2.1 Camada de Banco

#### A. Identificação de gargalos (slow queries)

1. Rode a seção 3 do `db-diagnostico-dba.sql` (`pg_stat_statements` já vem habilitado no Supabase).
2. No dashboard: **Reports → Query Performance** mostra o mesmo ranqueado por tempo total.
3. Atenção ao viés: como tudo passa por PostgREST com a service key, as queries aparecem como `SELECT ... FROM tabela WHERE ...` genéricas do PostgREST. As piores serão os `SELECT *` sem WHERE vindos dos `find({})` dos reports — confirmando Q1–Q5.
4. Depois das correções, `SELECT pg_stat_statements_reset();` e re-medir em 48h.

#### B. Indexação inteligente

Migration pronta: **`backend/migrations/040_dba_performance.sql`**. Conteúdo:

- Índices parciais para o caminho quente de reports: `item_checkins(status, checkin_at DESC) WHERE is_archived IS NOT TRUE`, equivalente em `checkins`, e `jobs(status, branch) WHERE archived IS NOT TRUE`.
- `item_checkins(checkin_at DESC)` para a paginação de `/item-checkins/all`.
- `coin_transactions(reference_type, reference_id)` e `visitas_tecnicas(created_at DESC)`.
- FKs faltantes de `job_photos` e `item_checkin_photos` com `NOT VALID` + `VALIDATE CONSTRAINT` (não bloqueia escrita durante a criação).
- Correção do CASCADE de auditoria em `coin_transactions`.

Regras de aplicação: usar `CREATE INDEX CONCURRENTLY` fora de transação (o SQL Editor do Supabase roda cada statement isolado — ok); criar índice **depois** de corrigir a query que o usa; 30 dias depois, dropar os não-usados que o diagnóstico apontar (seção 4 do script).

#### C. Leitura vs. Escrita (CQRS realista para este projeto)

Réplica de leitura física (Supabase Read Replicas) é a resposta errada *agora*: custo fixo alto, complexidade de roteamento, e o gargalo atual não é capacidade do Postgres — é o padrão de acesso. O CQRS que cabe neste sistema, em ordem:

1. **Read-model em SQL (já tem precedente):** converter os 5 reports críticos (Q1–Q5) em funções RPC `SECURITY DEFINER` com `search_path` fixo, exatamente como `report_visitas_by_vendedor`. Agregação (SUM, AVG, STDDEV, GROUP BY) sai do Python e vai para o Postgres. Ganho esperado: de segundos para dezenas de ms, e payload de MB para KB.
2. **Visões materializadas para dashboards:** `mv_metrics_diario` (contagens por status, m² por família/instalador) com `REFRESH MATERIALIZED VIEW CONCURRENTLY` disparado pelo cron existente das 06:00 e/ou após o sync. Dashboard lê a MV — custo de leitura ~zero.
3. **Só então, se o diagnóstico mostrar saturação real de CPU/IO sob leitura:** read replica + roteamento de `/reports/*` para a connection string da réplica.

### 2.2 Camada de Código

#### D. Caching estrito

Contexto que muda tudo: **Vercel serverless** — processos morrem, cache em memória é por-invocação-quente. Estratégia em camadas:

| Camada | O quê | TTL | Como |
|---|---|---|---|
| In-process (já existe, ajustar) | `_get_enrichment_maps`, catálogos (vendedores, tipos_servico, ferramentas), `system_config` | 5–10 min (hoje 30s) | dict global + ts, padrão já usado em item_checkins.py |
| Redis serverless (**Upstash**, integração nativa Vercel) | resultado de `get_current_user` (60s), respostas de `/reports/*` (5 min), saldo de gamificação | 60s–5min | `upstash-redis` HTTP — sem conexão TCP persistente, ideal p/ serverless. Invalidação: deletar chave no write correspondente |
| HTTP | `Cache-Control: private, max-age=300` nos reports | 5 min | header no FastAPI |
| Frontend (corrigir, não adicionar) | `api.js` stale-while-revalidate sem invalidação: mutação de job deve invalidar a chave do cache de jobs no localStorage; hoje o usuário vê dados de até 5 min após criar/editar | — | invalidar no `.then()` das mutações |

`get_current_user` merece nota: é a query mais frequente do sistema. Alternativa sem Redis: confiar nos claims do JWT (id, role) e só consultar `users` em rotas sensíveis (admin, troca de senha) — trade-off: desativação de usuário demora até o TTL/expiração para fazer efeito. Com TTL de 60s o risco é desprezível.

**Não fazer:** cache de check-in/checkout, GPS ou qualquer caminho de escrita de campo.

#### E. Connection pooling

A situação real é melhor do que parece, mas tem o que afinar:

- O backend **não abre conexão Postgres** — fala HTTP com PostgREST, que mantém seu próprio pool no lado Supabase. O client `supabase-py` já é **singleton global lazy** (`db_supabase.py:31–49`) ✅.
- Faltam **timeouts explícitos** no client (hoje herda default do httpx) — configurar `postgrest_client_timeout` ~10s para evitar function pendurada até o limite da Vercel.
- O dia em que os reports virarem RPC pesada ou alguém precisar de SQL direto (psycopg): usar o **Supavisor em transaction mode (porta 6543)** com pool mínimo (1–2 conexões por função serverless), nunca a porta 5432 direta — serverless + conexões diretas esgota `max_connections` rápido.

#### F. Eliminar N+1 e full scans (mapa de correção)

| Prioridade | Correção | Arquivo | Esforço |
|---|---|---|---|
| P0 | `sync_holdprint`: acumular jobs da página e usar `insert_many` | services/sync_holdprint.py | baixo |
| P0 | `list_jobs`: `item_checkins.find({"status": "in_progress", "job_id": {"$in": job_ids}})` | routes/jobs.py ~396 | trivial |
| P0 | Reports: mover filtro `is_archived` e datas para o `find()` (parar de filtrar em Python) — ganho imediato antes da migração p/ RPC | routes/reports.py | baixo |
| P0 | Corrigir semântica NULL: `{"archived": {"$ne": True}}` → `.not_.is_("archived", True)` ou `or=(archived.is.null,archived.eq.false)` no wrapper | db_supabase.py `$ne` | baixo |
| P1 | Converter Q1–Q5 em RPCs SQL (modelo: visitas_reports.py) | reports.py + migration | médio |
| P1 | `_enrich_installer_name`: bulk fetch `$in` antes do loop | routes/visitas.py | baixo |
| P1 | `list_jobs`: extrair os 5 campos de `holdprint_data` via select PostgREST (`holdprint_data->>code`, ...) ou coluna gerada | routes/jobs.py | médio |
| P2 | TTL do enrichment cache 30s → 300s | routes/item_checkins.py | trivial |
| P2 | `update_many` real (loop sobre matched ou `.update()` com filtro) — PENDING-004 | db_supabase.py | baixo |
| P2 | `add_coins` atômica via RPC única (upsert + increment + insert transaction) — antes de reativar gamificação | services/gamification.py + migration | médio |

### 2.3 Roadmap consolidado

**Sprint 1 — colher o que está maduro (1–2 dias, risco baixo)**
1. Rodar `db-diagnostico-dba.sql` → baseline de métricas.
2. Aplicar `040_dba_performance.sql` (índices + FKs NOT VALID).
3. Correções P0 de código (4 itens acima).
4. Confirmar que as migrations pendentes 038/039 foram aplicadas (o `$inc` atômico depende da RPC `increment_field` da 039).

**Sprint 2 — read-model (3–5 dias)**
5. RPCs SQL para os 5 reports + índices parciais que elas usam.
6. MV para o dashboard de métricas, refresh no cron.
7. Upstash Redis: cache de `get_current_user` e reports.

**Sprint 3 — higiene (contínuo)**
8. Dropar índices mortos (após 30 dias de `pg_stat_user_indexes`).
9. Invalidação de cache no frontend (api.js).
10. Normalizar tipos (S6–S8) e deprecar `current_level` (S9) — migrations de baixo risco, uma por vez.

### 2.4 O que NÃO fazer agora

- **Read replica / multi-região:** custo sem retorno no volume atual; reavaliar pós-Sprint 2 com dados.
- **Trocar o wrapper MongoDB-like por ORM:** reescrita de alto risco; a estratégia de RPCs para os caminhos pesados captura 90% do ganho mantendo o legado estável.
- **Sharding/particionamento:** `item_checkins` só justifica particionamento por data acima de dezenas de milhões de linhas. Marcar para revisar quando o diagnóstico mostrar >5M.

---

## Anexos

- `db-diagnostico-dba.sql` — script de diagnóstico completo (rodar no SQL Editor).
- `backend/migrations/040_dba_performance.sql` — DDL proposto (revisar antes de aplicar; **não** aplicar junto com deploy de código que ainda não usa os índices, mas pode aplicar antes sem risco).
