# Plano de Correção — Seção Instalador (instal-visual.com.br)

**Auditoria executada em:** 2026-05-18
**Job sob teste:** `9486c6f5-ae38-4469-9434-0bd3def4ecaa` — MOBI / SERPO-SERVICOS DE PORTARIA LTDA
**Ambiente:** Produção (Supabase `qfsxtwkltfraounsjjah`)
**Método:** Login real com installer de teste `qa-claude+installer@instal-visual.com.br`, navegação até `/installer/job/9486c6f5...`, tentativa de check-in com GPS e foto mockados, cruzamento da UI ↔ banco ↔ CLAUDE.md.

> Cleanup confirmado: usuário, installer, todos os checkins, alertas, transactions e gamification do test user removidos. `assigned_installers` do job restaurado ao estado original `["90361746-1589-4750-aab1-b2efcd3cb218"]`.

---

## Sumário Executivo

A auditoria revelou **um defeito arquitetural de identidade de usuário** que provavelmente é a causa raiz de várias inconsistências percebidas no dia a dia (dashboard zerado, atribuições "invisíveis", relatórios divergentes). Acompanham 9 bugs adicionais de severidade P0/P1, além de drift entre CLAUDE.md e o schema real do banco.

Recomenda-se **não fazer deploy de novas features no fluxo do instalador** até que pelo menos os 5 P0 abaixo estejam corrigidos.

---

## P0 — Bloqueia produção / integridade de dados

### P0-1 · Dupla identidade do installer (`installers.id` ≠ `users.id`)

**Diagnóstico.** O sistema usa dois UUIDs distintos para a mesma pessoa:

| Tabela / campo | UUID usado | Fonte verificada |
|---|---|---|
| `jobs.assigned_installers[]` | `installers.id` | `["90361746-…"]` para "rec" |
| `item_checkins.installer_id` | `installers.id` | `90361746-…` em 3 registros do job alvo |
| `checkins.installer_id` | `installers.id` (assumido) | mesmo padrão |
| `jobs.item_assignments[].installer_id` (TEXT/JSON) | `users.id` | `ac8a4db1-…` para "rec" |
| `coin_transactions.user_id` | `users.id` | esperado |
| JWT do login → `users.id` | `users.id` | confirmado em `localStorage.auth_token` |

A tabela `installers` confirma o mapeamento: `id=90361746-…` mas `user_id=ac8a4db1-…` para o mesmo "rec".

**Consequência observada.** O test user que criei recebeu `id = user_id` por inserção manual, então funcionou. Mas instaladores reais (que entram via auto-register) ficam com IDs diferentes. Resultado: dashboards filtram por um campo e atribuições por outro, gerando "0 em andamento" mesmo quando há item_assignments.

**Plano (subtarefas).**
1. Migration: forçar `installers.id = installers.user_id` para todos os registros existentes. Backfill via `UPDATE installers SET id = user_id`.
2. Adicionar constraint `CHECK (id = user_id)` ou simplesmente remover a coluna `installers.id` e usar `user_id` como PK.
3. Renomear / normalizar todas as referências em rotas: `installer_id` sempre = `users.id`.
4. Em `backend/routes/installers.py`: garantir que `create_installer` use `user_id` como `id`.
5. Migration de dados: para cada `assigned_installers` e `item_checkins.installer_id` em todo o banco, substituir o valor antigo (`installers.id`) pelo `installers.user_id` correspondente. Testar com `--dry-run` primeiro.
6. Verificar `gamification_balances.user_id` — deve estar OK, mas confirmar.
7. Adicionar teste E2E que falha se o JWT do installer não bater com `assigned_installers`.

---

### P0-2 · 4 de 7 itens do job invisíveis para o instalador (arquivamento silencioso)

**Diagnóstico.** A tela `/installer/job/{id}` exibe **"Itens do Job (3)"** apesar do banco ter 7 produtos em `products_with_area`. Inspeção em `jobs.archived_items` (TEXT/JSON) mostra que o manager "Rodrigo Motta" arquivou os itens 3, 4, 5 e 6 em 2026-05-18 15:23-15:24. A UI simplesmente esconde os arquivados, sem indicar ao instalador que houve corte de escopo.

**Risco.** Instalador pode chegar no local e não saber que parte do serviço foi suprimida (ex.: serviço de instalação propriamente dito ficou no `archived_items[]`).

**Plano.**
1. Adicionar seção colapsada "Itens removidos do escopo (4)" abaixo da lista ativa, mostrando nome do item e quem arquivou.
2. Backend `/jobs/{id}` deve devolver `archived_items` ao role installer (atualmente parece filtrar).
3. Investigar a regra: por que `item_assignments` tem item_index=4 atribuído ao "rec" mas o mesmo item_index=4 está em `archived_items`? Ver P0-3.

---

### P0-3 · Estado inconsistente: item arquivado AINDA atribuído

**Diagnóstico.** `jobs.archived_items` contém `item_index=4` (arquivado por Rodrigo Motta), mas `jobs.item_assignments` ainda mantém o mesmo `item_index=4` atribuído a "rec" (`status: pending`). Estado mutuamente exclusivo violado no JSON.

**Plano.**
1. Rota `POST /jobs/{id}/archive-item` deve atomicamente:
   - Adicionar a `archived_items`
   - Remover de `item_assignments`
2. Migration data-fix: SQL para deduplicar — para todo job, remover de `item_assignments` qualquer entry cujo `item_index` apareça em `archived_items`.
3. Adicionar trigger Postgres `BEFORE UPDATE` em `jobs` que rejeite o estado conflitante (defesa em profundidade).

---

### P0-4 · `client_address` vazio chega ao instalador sem aviso

**Diagnóstico.** `jobs.client_address` está literalmente `""` no banco para o job `9486c6f5`. A UI exibe apenas o nome do cliente (`SERPO-SERVICOS DE PORTARIA LTDA`) sem endereço, sem `scheduled_date` (que era 2026-05-18 15:28 UTC = mesmo dia da auditoria) e sem telefone de contato.

**Risco.** Instalador chega no horário e não sabe onde nem para quem ligar. Job no status `instalando` desde antes das 18h sem deslocamento físico possível.

**Plano.**
1. Backend deve validar no `sync-holdprint` que `client_address` não está vazio — se estiver, gravar com fallback `"Endereço pendente — solicitar ao CS"` e disparar alerta para gestor.
2. UI: exibir um banner vermelho no topo do card do job se `client_address` for vazio. CTA: "Solicitar endereço ao CS".
3. Sempre exibir `scheduled_date` formatada (data + hora local America/Sao_Paulo).
4. Adicionar campo `client_phone` ao schema (consultar Holdprint API para o payload completo).

---

### P0-5 · Cache local com chave `[object Object]` poluindo localStorage

**Diagnóstico.** Em `localStorage` apareceu a chave `cache_jobs_v1_[object Object]` — clássico bug de template string que recebeu objeto sem `JSON.stringify`. Provavelmente em `frontend/src/utils/api.js` (wrapper Axios com cache) ou em algum hook (`useJobs.js`).

**Risco.**
- Todas as requests com filtros objeto-tipados colidem na mesma chave.
- Usuário pode ver dados de outro role/filtro em cache.
- Quota de localStorage cresce ilimitadamente.

**Plano.**
1. `grep -rn "cache_jobs_v1" frontend/src/` para localizar o ponto de geração.
2. Substituir `${someFilter}` por `JSON.stringify(someFilter)` ou hash determinístico.
3. Migration de cliente: no boot do app, executar `Object.keys(localStorage).filter(k=>k.includes('[object Object]')).forEach(k=>localStorage.removeItem(k))`.

---

## P1 — Deve corrigir antes da próxima sprint

### P1-6 · Drift da documentação `CLAUDE.md` vs schema real

A doc afirma colunas que **não existem**:
- `jobs.codigo` (real: `holdprint_job_id`)
- `jobs.assigned_to` (real: `assigned_installers jsonb`)
- `jobs.address` / `jobs.lat` / `jobs.long` (real: `client_address`, sem lat/long)

E afirma **tipos JSONB** para colunas que são TEXT:
- `jobs.items` (TEXT armazenando JSON)
- `jobs.holdprint_data` (TEXT)
- `jobs.products_with_area` (TEXT)
- `jobs.item_assignments` (TEXT)
- `jobs.archived_items` (TEXT)

**Impacto.** Perde indexação JSONB e operadores `->`, `->>`, `@>`. Queries do tipo "todo job com adesivo perfurado" não conseguem usar GIN index. Também invalida vários trechos de ARCH-005 (`_filter_columns()` "JSONB nativo").

**Plano.**
1. Atualizar `CLAUDE.md` com schema real (gerar via `information_schema.columns`).
2. Migration `032_jsonify_items_columns.sql`: `ALTER COLUMN items TYPE jsonb USING items::jsonb;` para as 5 colunas afetadas.
3. Backfill: verificar previamente que todos os valores são JSON válido (`SELECT id FROM jobs WHERE items IS NOT NULL AND items !~ '^\[' AND items !~ '^\{';`).
4. Atualizar `db_supabase.py` `TABLE_COLUMNS` registry.

---

### P1-7 · Rota `/installer` redireciona para `/installer/dashboard` (não documentado)

CLAUDE.md afirma que a rota é `/installer`, mas o login leva para `/installer/dashboard`. Coexistem dois caminhos? Verificar `frontend/src/App.js` e atualizar a documentação.

---

### P1-8 · Dashboard mostra "0 Em Andamento" mesmo com job atribuído

Após adicionar o test user ao `assigned_installers`, o dashboard ainda exibia 0. Provavelmente porque a UI filtra por `item_assignments[].installer_id` (= `users.id`) — efeito colateral direto do P0-1. Quando este for corrigido, validar este sintoma novamente.

---

### P1-9 · Mensagem de erro genérica "Erro ao processar imagem. Tente novamente."

O upload da foto de check-in falhou (foto inválida, esperado em teste), mas o toast:
- Sem código de erro
- Sem orientação (tamanho? formato? conexão?)
- Sem botão de retry contextual

**Plano.** Em `frontend/src/utils/api.js`, mapear status HTTP do `/checkins` e `/item-checkins` para mensagens distintas:
- 400 com payload `{detail:"invalid_image"}` → "A foto não pôde ser lida. Tire outra com boa iluminação."
- 413 → "Foto muito grande. Reduza a qualidade da câmera."
- 5xx → "Servidor indisponível. Tente em alguns segundos." + botão Retry.

---

### P1-10 · Acessibilidade básica ausente nos cards de item

A query `document.querySelectorAll('button, a, [role=button]')` no estado colapsado retornou **VAZIO** — cards são `<div onClick>` sem `role`, `tabindex` ou `aria-expanded`. Botão "←" voltar sem `aria-label`. Botão "Fazer Check-in" com `type="submit"` fora de `<form>`.

**Plano.**
1. Cards expandíveis: usar `<button>` ou `<div role="button" tabindex="0" aria-expanded="false">` com handler para Enter/Space.
2. Botão voltar: adicionar `aria-label="Voltar para lista de jobs"`.
3. Botão Check-in: `type="button"` (não submit).
4. Rodar `axe-core` no fluxo e fechar todas as violations.

---

### P1-11 · KPI "m² Instalados: 0.0" pintado de rosa/vermelho

Cor de erro aplicada a KPI neutro. Quando `instalados < total`, usar a cor secundária; quando `instalados = 0`, manter cinza. Reservar rosa `#e94560` para alertas e CTAs.

---

### P1-12 · "m² Total: 1.9" vs `area_m2 = 1.91` no banco vs soma dos visíveis = 1.64

Três valores diferentes. O exibido (1.9) usa **truncamento**, deveria usar **arredondamento** (`1.91 → 1.9` ou `→ 1.91`). E quando 4 itens são arquivados (-0.27 m²), o "Total" deveria refletir o escopo ATIVO, não o original. Decidir contrato: "Total do escopo contratado" vs "Total do escopo a executar".

---

### P1-13 · Saudação "Olá, QA" trunca no primeiro espaço

Em `frontend/src/pages/InstallerDashboard.jsx` (ou equivalente): `user.name.split(' ')[0]` quebra com nomes compostos. Usar `user.first_name` ou exibir nome completo.

---

### P1-14 · Footer "© 2025 INDÚSTRIA VISUAL" (estamos em 2026)

Hardcoded. Trocar por `{new Date().getFullYear()}`.

---

## P2 — Melhorias

- **P2-15.** Validar GPS contra `jobs.client_address` (geocode) — bloquear check-in se distância > 5 km mesmo sem `MAX_CHECKOUT_DISTANCE_METERS` cobrir entrada.
- **P2-16.** `installers.coins` e `installers.total_jobs` zerados mesmo para "rec" que tem atividade. Source-of-truth é `gamification_balances` — remover colunas duplicadas ou criar trigger de sync.
- **P2-17.** Adicionar header `X-Bypass-Cache: true` quando query string contém `?_t=` (debugging).
- **P2-18.** Mover token storage de `localStorage` para httpOnly cookie (XSS resilience). Hoje uso de `localStorage.auth_token` está exposto a qualquer script de terceiros (vimos `scribe_extension_state` coexistindo).
- **P2-19.** "Fazer Check-in (Tirar Foto)" — separar em duas etapas: 1) Câmera abre, 2) Confirma upload. Hoje a foto vai direto sem preview.

---

## Bugs já documentados em CLAUDE.md (revisão de status)

| ID antigo | Status confirmado nesta auditoria |
|---|---|
| PENDING-001 (`$inc` não atômico) | Continua. Cleanup do test user não causou race, mas é matéria de tempo. |
| PENDING-002 (`add_coins` async sem await) | Não exercitado neste teste (check-in não completou). Mantém suspeita. |
| PENDING-003 (level vs current_level) | Não exercitado, mas test user nem chegou a ganhar moedas. Continua. |
| PENDING-005 (senha mínima 6 chars) | Confirmado — meu test user usa senha de 17 chars, mas o registro aceitaria 6. |

---

## Roteiro de execução sugerido

```
Semana 1
├── P0-1  · Unificar installers.id ≡ users.id (migration + backfill + rotas) ← 3 dias
├── P0-5  · Limpar cache [object Object] (frontend + boot cleanup)            ← 0.5 dia
└── P0-4  · Exibir endereço/data/aviso vazio                                  ← 1 dia

Semana 2
├── P0-2 + P0-3 · Coerência archived_items ↔ item_assignments                 ← 2 dias
├── P1-9  · Mensagens de erro do upload de foto                               ← 0.5 dia
└── P1-10 · A11y dos cards e botões                                           ← 1.5 dia

Semana 3
├── P1-6  · Migração colunas TEXT→JSONB + atualizar CLAUDE.md                 ← 2 dias
├── P1-8 · Validar dashboard "0 em andamento" pós-P0-1                       ← 0.5 dia
└── P1-11, P1-12, P1-13, P1-14 · UI/UX polish                                 ← 1 dia

Backlog
└── P2-15 a P2-19
```

---

## Anexo A — Evidências de teste

- **Test user criado:** `8097b871-d898-4e09-84f9-be1ea68bbdaa` (deletado em cleanup)
- **Login bem-sucedido:** toast "Login realizado com sucesso!" + redirect para `/installer/dashboard`
- **Tela do job:** screenshot anexado mostra 3 itens, "0/3", "0.0", "1.9 m²"
- **Tentativa de check-in:** botão clicado, GPS mockado (-30.0346, -51.2177) aceito, upload de foto mock (21 bytes JPEG inválido) rejeitado com erro genérico
- **Banco antes e depois:** `assigned_installers` retornou ao estado original; 0 registros remanescentes do test user em todas as tabelas relevantes.
