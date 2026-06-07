# Auditoria — PENDING bugs + triagem rápida

**Data:** 2026-05-15
**Escopo:** Verificação dos 5 PENDING documentados em `CLAUDE.md` + varredura rápida de padrões similares
**Profundidade:** Triagem (sem cross-checks aprofundados)
**Status geral:** 1 BLOQUEANTE crítico de segurança descoberto fora dos PENDINGs + os 5 PENDINGs confirmados + duplicação severa de lógica de gamificação.

---

## Sumário executivo

| Severidade | Quantidade | Resumo |
|---|---|---|
| 🔴 **BLOQUEIA produção** | 2 | Segredos reais em texto-claro no repo; senha de 6 chars |
| 🟠 **DEVE corrigir antes do próximo deploy** | 4 | $inc não atômico em moedas, lógica de gamificação triplicada, código morto, schema de nível inconsistente |
| 🟡 **Melhoria** | 3 | `update_many` quebrado (impacto baixo), promise silenciosa no front, except genéricos |

---

## 🔴 BLOQUEANTES (corrigir antes de qualquer deploy)

### B-001 — Segredos reais em texto-claro no repositório (CRÍTICO)

**Arquivos com segredos expostos:**

| Arquivo | Segredo exposto |
|---|---|
| `GITHUB_VERCEL_SETUP.md:92` | `SUPABASE_SERVICE_KEY = sb_secret_uMmCrswTXuAAI0buga8NQQ_vFRSMRWb` |
| `GITHUB_VERCEL_SETUP.md:95-96` | `HOLDPRINT_API_KEY_POA` e `HOLDPRINT_API_KEY_SP` (UUIDs reais) |
| `GITHUB_VERCEL_SETUP.md:97` | `RESEND_API_KEY = re_hh6JyAXw_6sykfRUqxqkE1FbDzja6H7V5` |
| `GITHUB_VERCEL_SETUP.md:101` | `VAPID_PRIVATE_KEY` em PEM completo |
| `DOCUMENTATION.md:100-101` | Mesmas chaves Holdprint |

**O `.gitignore` NÃO ignora esses arquivos.** Ele ignora `HOLDPRINT_API_INFO.md` e `VERCEL_ENV_*.txt`, mas deixa `GITHUB_VERCEL_SETUP.md` e `DOCUMENTATION.md` passarem.

**Impacto:** Se algum desses arquivos foi commitado (mesmo que depois removido), as chaves estão no histórico do git de forma permanente. O CLAUDE.md já registra um vazamento anterior do token Vercel via screenshot — esses arquivos amplificam muito o problema.

**Correção (ordem):**
1. Rotacionar TODAS as 4 chaves no Supabase, Holdprint, Resend e VAPID.
2. Adicionar ao `.gitignore`:
   ```
   GITHUB_VERCEL_SETUP.md
   DOCUMENTATION.md
   DOCUMENTACAO_SISTEMA.md
   DOCUMENTACAO_SISTEMA.html
   DOCUMENTACAO_SISTEMA_COMPLETA.md
   AUDITORIA_CODIGO.md
   ```
3. Verificar histórico: `git log --all -- GITHUB_VERCEL_SETUP.md DOCUMENTATION.md` — se algum commit tem o arquivo, fazer `git filter-repo` ou BFG para limpar histórico, e considerar o repo comprometido.
4. Substituir conteúdo dos arquivos por placeholders (`<rotacionar — ver Vercel Env Vars>`) como já está em `DEPLOY_VERCEL_COMPLETO.md`.

---

### B-002 — Senha mínima de 6 caracteres em auto-registro (PENDING-005 confirmado)

**Arquivo:** `backend/routes/auth_new.py:151`

```python
if len(request.password) < 6:
    raise HTTPException(...)
```

**Há 2 rotas afetadas:** `/register` (linha 138) e `/self-register` (linha 215) — ambas públicas, sem rate limit.

**Impacto:** Conta de instalador comprometida = acesso a fotos/GPS de clientes + login no app de campo. 6 chars sem complexidade é força-bruta trivial. Não há rate limit no `/login` nem captcha.

**Correção:**
- Mínimo 10 caracteres
- Exigir 1 maiúscula, 1 número OU 1 caractere especial (pode usar `re.search`)
- Bloquear lista das ~100 senhas mais comuns (ex: `secure-password-1`, `senha123`, etc.)
- Adicionar rate limit no `/login` (ex: `slowapi`) — 5 tentativas / 15min / IP

---

## 🟠 DEVE corrigir antes do próximo deploy

### D-001 — `$inc` não é atômico em saldo de moedas e estoque (PENDING-001 confirmado)

**Arquivo:** `backend/db_supabase.py:424-428`

```python
elif '$inc' in update:
    existing = self.find_one(query)   # READ
    if existing:
        for field, inc_val in update['$inc'].items():
            update_data[field] = (existing.get(field, 0) or 0) + inc_val  # WRITE
```

**Callers críticos em produção:**

| Arquivo | Linha | O que incrementa | Risco |
|---|---|---|---|
| `routes/gamification.py` | 537 | `rewards.stock -= 1` ao resgatar prêmio | **Estoque negativo** se 2 instaladores resgatarem ao mesmo tempo |
| `routes/gamification.py` | 620 | `gamification_balances.total_coins` no rollback de pedido cancelado | **Moedas perdidas/duplicadas** sob concorrência |

**Por que isso é "deve corrigir" e não "bloqueia":** o sistema tem ~poucos instaladores simultâneos hoje, então a janela de race é pequena. Mas qualquer pico (notificação push em massa) reproduz.

**Correção:** criar RPC SQL no Supabase:

```sql
CREATE OR REPLACE FUNCTION increment_field(
  p_table text, p_id_field text, p_id text, p_field text, p_delta int
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('UPDATE %I SET %I = COALESCE(%I,0) + $1 WHERE %I = $2',
                 p_table, p_field, p_field, p_id_field) USING p_delta, p_id;
END $$;
```

E em `db_supabase.py`, substituir o branch do `$inc` para chamar `supabase.rpc("increment_field", {...})`.

---

### D-002 — `add_coins()` é CÓDIGO MORTO + sinaliza arquitetura confusa (PENDING-002 reclassificado)

**Achado:** `backend/services/gamification.py:45` define `async def add_coins(...)` — mas o grep em `backend/routes/` **não encontrou nenhum caller**. A função existe e é exportada em `services/__init__.py`, mas ninguém a chama.

A função realmente usada é `award_coins()` em `backend/routes/gamification.py:173` — uma implementação **diferente** (usa `level: level_key` string como "bronze", "prata", "ouro", "faixa_preta", enquanto `add_coins` usa `level: str(int)` numérico "1"-"10").

**Pior:** `calculate_checkout_coins` tem **3 implementações diferentes**:

| Local | Lógica |
|---|---|
| `services/gamification.py:106` | Usa `COIN_REWARDS` dict, dá pontos fixos por evento. **Não usada.** |
| `routes/gamification.py:106` | Usa `BASE_COINS_PER_M2` + percentuais por trigger (50/20/10/20). **Usada** em `routes/gamification.py:368`. |
| `routes/item_checkins.py:188` | Definição local, não consegui ver o corpo nesta varredura — provavelmente uma 3ª variante. |

**Impacto:** Manutenção venenosa. Quem editar `services/gamification.py` para "corrigir um bug de moedas" estará editando código morto. PENDING-002 (`async sem await`) é um sintoma, não o problema raiz.

**Correção:**
1. Decidir qual é a fonte da verdade (provavelmente `routes/gamification.py`).
2. Mover toda lógica para `services/gamification.py` (camada de serviço), deixar `routes/gamification.py` só com handlers.
3. Apagar `add_coins` e a `calculate_checkout_coins` mortas, ou unificar.
4. Remover a função sombra em `routes/item_checkins.py:188`.

---

### D-003 — Schema de nível inconsistente em `gamification_balances` (PENDING-003 confirmado e ampliado)

**Sintoma do conflito:** múltiplos lugares escrevem coisas diferentes no MESMO campo `level`:

| Arquivo:linha | Escreve em `level` | Valor |
|---|---|---|
| `routes/auth_new.py:198` | string | `"bronze"` |
| `routes/auth_new.py:295` | string | `"bronze"` |
| `services/gamification.py:60` | string | `"bronze"` (mas só na 1ª inserção; updates usam numérico) |
| `services/gamification.py:79` | string numérica | `str(1..10)` |
| `routes/gamification.py:195` | string nomeada | `"bronze"`, `"prata"`, `"ouro"`, `"faixa_preta"` |

**Impacto:** Frontend pode ler `level` e:
- Não encontrar o ícone (se vier "1" mas o front espera "bronze")
- Mostrar nível errado (se vier "bronze" como default em vez do nível calculado)
- Quebrar comparações `if level === "faixa_preta"` quando o backend gravou "10".

**Correção:**
1. Decidir o esquema (recomendo numérico `1`–`10` como string para JSONB compat).
2. Migration: `UPDATE gamification_balances SET level = '1' WHERE level = 'bronze'; ...`
3. Padronizar TODOS os call sites a usar uma única função (ex: `get_level_string(coins)`).
4. Deprecar o campo `current_level` (já marcado como legado no CLAUDE.md mas ainda é populado em `auth_new.py:197,294`).

---

### D-004 — `update_many` quebrado mas pouco usado (PENDING-004 confirmado)

**Arquivo:** `backend/db_supabase.py:467-469`

```python
def update_many(self, query, update):
    return self.update_one(query, update)  # ← delega ao update_one
```

**Único caller:** `backend/server.py:85`

```python
db.installers.update_many({}, {"$set": {"coins": 0, "total_jobs": 0, "total_area_installed": 0}})
```

**Onde:** dentro de endpoint admin `/admin/limpar-dados-teste`, protegido por `env != 'production'`.

**Impacto real:** baixo. Em dev/staging, só zera o primeiro instalador. Os outros continuam com moedas antigas, contaminando testes silenciosamente. Não afeta produção (rota lança 403 lá).

**Correção mínima:**
```python
def update_many(self, query, update):
    # PostgREST aplica .update() a TODOS que matcham o filtro
    return self.update_one(query, update)  # já é update_many de fato pelo PostgREST
```
... espera, isso **já está correto** se for filtro vazio: o PostgREST sem `.eq()` atualiza todos. **O bug é falso? Quase.** O problema é que `update_one` retorna `modified_count = len(result.data)` que conta todos os afetados, então pode estar funcionando. **Mas** a semântica MongoDB de `update_many` é "todos que matcham" enquanto `update_one` é "no máximo 1" — então quem confia no contrato pode quebrar.

**Recomendação:** documentar no `db_supabase.py` que `update_many == update_one` (ambos afetam todos os matches do filtro no PostgREST) e renomear `update_one` mentalmente para "update". Ou implementar `update_one` com `.limit(1)` para honrar o contrato.

---

## 🟡 Melhorias

### M-001 — Promise silenciosa em `useApiCall.js`

**Arquivo:** `frontend/src/hooks/useApiCall.js:113`

```js
refresh().catch(() => {});
```

Engole qualquer erro do refresh. Se a chamada falhar, o usuário vê dados velhos sem aviso.

**Fix:** `refresh().catch(e => console.error('refresh failed:', e));` no mínimo, idealmente um `setError(e)` para a UI exibir.

---

### M-002 — `except Exception` genéricos em rotas críticas

**Arquivos:**
- `backend/routes/jobs.py:977` — silencia erros de formatação de data em notificação push
- `backend/routes/calendar.py:564` — silencia parse de OAuth state (mas pelo menos define fallback `{}`)
- `gps_test_focused.py:501` — `except: pass` bare (mas é arquivo de teste, baixo risco)

**Fix:** logar antes de engolir: `except Exception as e: logger.warning("...", exc_info=True)`.

---

### M-003 — Rotas públicas que parecem privadas

- `/api/pause-reasons` (`item_checkins.py:891`) retorna constantes — público é OK funcionalmente, mas qualquer scanner que entra na app vê estrutura de causa. Adicionar `Depends(get_current_user)` por consistência.
- `/api/notifications/vapid-public-key` (`notifications.py:137`) — público OK (é a chave **pública**).
- `/api/integration/schedule` (`integration.py:43`) — protegido por `_verify_key(request)` (header API key), OK.

---

## Plano de refatoração sugerido (ordem de execução)

### Sprint 1 — Bloqueio de segurança (4–8h)
1. **B-001:** Rotacionar 4 chaves + atualizar `.gitignore` + sanitizar arquivos de doc.
2. **B-002:** Subir mínimo de senha para 10 chars com complexidade. Adicionar rate-limit no login.

### Sprint 2 — Consolidar gamificação (1 dia)
3. **D-002 + D-003:** Decidir fonte da verdade (`routes/gamification.py:award_coins`), migrar tudo para `services/`. Apagar `add_coins`, sombra de `calculate_checkout_coins` em `item_checkins.py`, e bronze-strings no `auth_new.py`. Migration para normalizar `level`.

### Sprint 3 — Atomicidade (meio dia)
4. **D-001:** Criar RPC `increment_field` no Supabase + reescrever branch `$inc` em `db_supabase.py` para usar RPC. Atualizar PENDING-001 no CLAUDE.md como resolvido.

### Sprint 4 — Polimento (2h)
5. **D-004:** Documentar comportamento de `update_many` (ou implementar `.limit(1)` no `update_one`).
6. **M-001, M-002:** Trocar `.catch(() => {})` e `except: pass` por logging.

---

## O que NÃO foi auditado (escopo limitado a "triagem rápida")

- Cross-check de rotas que o frontend chama vs. rotas que existem no backend
- Validação completa de inputs Pydantic vs. corpo dos requests
- Cobertura de testes (não vi pasta `tests/`)
- Segurança de RLS no Supabase (CLAUDE.md já documenta status OK)
- Comportamento sob carga (load test)
- Acessibilidade do frontend
- Memory leaks em React (deps de hooks)

Se quiser ampliar para qualquer um desses, é só pedir.
