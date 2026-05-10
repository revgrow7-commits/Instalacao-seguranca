# instal-visual — Backlog de Tarefas

> Última atualização: 2026-05-08  
> Formato: prioridade → tamanho → arquivo → critério de aceite

---

## Legenda

| Campo | Valores |
|---|---|
| **Prioridade** | 🔴 Crítico / 🟠 Alto / 🟡 Médio / 🔵 Baixo |
| **Tamanho** | XS (< 30 min) / S (< 2h) / M (< 1 dia) / L (> 1 dia) |
| **Status** | `[ ]` Pendente / `[x]` Concluído / `[~]` Em progresso |

---

## 🔴 Crítico

### [BUG-001] `$inc` não atômico — race condition em contadores de instaladores
- **Prioridade:** 🔴 Crítico
- **Tamanho:** M
- **Arquivo:** `backend/db_supabase.py` linha ~415, `backend/services/gamification.py` linha 69
- **Problema:** `$inc` faz read-then-write. Dois checkouts simultâneos do mesmo instalador podem perder um incremento em `total_jobs`, `total_area_installed` e `total_coins`.
- **Solução:**
  1. Criar RPC Supabase:
     ```sql
     CREATE OR REPLACE FUNCTION increment_field(
       p_table TEXT, p_id UUID, p_field TEXT, p_delta NUMERIC
     ) RETURNS void LANGUAGE plpgsql AS $$
     BEGIN
       EXECUTE format('UPDATE %I SET %I = %I + $1 WHERE id = $2', p_table, p_field, p_field)
       USING p_delta, p_id;
     END;
     $$;
     ```
  2. Substituir o handler `$inc` em `db_supabase.py` pelo `supabase.rpc("increment_field", ...)`
  3. Na `add_coins()`: substituir read-then-write por RPC direto na `gamification_balances`
- **Critério de aceite:** Dois checkouts simultâneos acumulam `total_jobs` corretamente sem perda.
- **Status:** `[ ]`

---

## 🟠 Alto

### [BUG-002] `add_coins()` é `async def` mas os callers não fazem `await`
- **Prioridade:** 🟠 Alto
- **Tamanho:** S
- **Arquivo:** `backend/services/gamification.py` linha 45; `backend/routes/gamification.py`, `backend/routes/checkins.py`, `backend/routes/item_checkins.py`
- **Problema:** `async def add_coins()` retorna coroutine. Se o caller não faz `await`, a moeda nunca é creditada — silenciosamente.
- **Solução:**
  ```bash
  # 1. Verificar todos os callers:
  grep -rn "add_coins" backend/routes/ --include="*.py"
  ```
  Duas opções: (a) converter `add_coins()` para `def` síncrono (o DB é síncrono); (b) garantir `await add_coins()` em todos os callers em funções `async def`.
- **Critério de aceite:** Moedas são creditadas corretamente após um checkout. Testar via endpoint real + verificar `gamification_balances`.
- **Status:** `[ ]`

### [BUG-003] `update_many` delega para `update_one` — só atualiza 1 registro
- **Prioridade:** 🟠 Alto
- **Tamanho:** S
- **Arquivo:** `backend/db_supabase.py` linha ~456
- **Problema:** `db.table.update_many(query, update)` chama `update_one()` internamente. Qualquer código que espera atualizar múltiplos registros só atualiza o primeiro.
- **Solução:**
  ```python
  def update_many(self, query: Dict[str, Any], update: Dict[str, Any]) -> Dict:
      """Update all documents matching query"""
      try:
          update_data = update.get('$set', update)
          clean_update = {k: _serialize(v) for k, v in update_data.items() if v is not None}
          clean_update = _filter_columns(self.table_name, clean_update)
          if not clean_update:
              return {'modified_count': 0}
          builder = self._table().update(clean_update)
          for key, value in query.items():
              if not key.startswith('$'):
                  builder = _apply_filter(builder, key, value)
          result = builder.execute()
          return {'modified_count': len(result.data) if result.data else 0}
      except Exception as e:
          logger.error(f"update_many error on {self.table_name}: {e}")
          raise
  ```
- **Critério de aceite:** `db.checkins.update_many({"job_id": id}, {"$set": {"is_archived": True}})` atualiza todos os checkins do job.
- **Status:** `[ ]`

### [SECURITY-001] CORS wildcard em produção
- **Prioridade:** 🟠 Alto
- **Tamanho:** XS
- **Arquivo:** `backend/server.py` linha ~218, `backend/config.py`
- **Problema:** `allow_origins=os.environ.get('CORS_ORIGINS', '*').split(',')` — se a env não for configurada no Vercel, qualquer origem pode chamar a API com credenciais.
- **Solução:** Configurar no Vercel dashboard: `CORS_ORIGINS=https://instal-visual.com.br,https://somos-industriavisual.com.br`
- **Critério de aceite:** Request de origem desconhecida recebe erro CORS.
- **Status:** `[ ]`

---

## 🟡 Médio

### [BUG-004] Inconsistência no schema de nível de gamificação
- **Prioridade:** 🟡 Médio
- **Tamanho:** M
- **Arquivo:** `backend/services/gamification.py`, `backend/db_supabase.py` → `TABLE_COLUMNS["gamification_balances"]`
- **Problema:** Dois campos coexistem com schemas diferentes:
  - `current_level`: string legada ("bronze", "silver"...)
  - `level`: string numérica atual ("1"..."10")
  O frontend pode exibir nível errado se usar `current_level`.
- **Solução:**
  1. Migration SQL para unificar: `UPDATE gamification_balances SET current_level = level WHERE current_level != level`
  2. No `add_coins()`, remover o update de `current_level`
  3. No frontend, sempre usar `level` (numérico)
- **Critério de aceite:** Relatório de gamificação exibe o nível correto para todos os instaladores.
- **Status:** `[ ]`

### [SECURITY-002] Senha mínima de 6 caracteres em auto-registro
- **Prioridade:** 🟡 Médio
- **Tamanho:** XS
- **Arquivo:** `backend/routes/auth_new.py` linhas 152, 471, 526 (3 lugares)
- **Problema:** Mínimo de 6 caracteres facilita força bruta. Não há rate limiting no endpoint de login.
- **Solução:**
  1. Aumentar mínimo para 8 caracteres nos 3 lugares com `len(password) < 8`
  2. (Opcional, M) Adicionar rate limiting via middleware ou Vercel Edge: 5 tentativas por IP por minuto
- **Critério de aceite:** Senha com 7 caracteres retorna erro 400.
- **Status:** `[ ]`

### [CHORE-001] Adicionar novo campo ao `TABLE_COLUMNS` após migration
- **Prioridade:** 🟡 Médio
- **Tamanho:** XS (por migration)
- **Arquivo:** `backend/db_supabase.py` → `TABLE_COLUMNS`
- **Problema:** Cada vez que uma migration adiciona coluna no banco, o registro em `TABLE_COLUMNS` precisa ser atualizado manualmente. Se esquecer, `_filter_columns()` descarta o campo silenciosamente.
- **Solução:** Criar um teste de consistência que compara `TABLE_COLUMNS` com as colunas reais do Supabase via `information_schema.columns`. Rodar no CI.
- **Status:** `[ ]`

---

## 🔵 Baixo — Débito técnico

### [CHORE-002] Converter `database.py` e `database_supabase.py` legados
- **Prioridade:** 🔵 Baixo
- **Tamanho:** S
- **Arquivo:** `backend/database.py`, `backend/database_supabase.py` — arquivos legados ainda presentes
- **Solução:** Verificar se há importações deles: `grep -r "from database" backend/ --include="*.py"`. Se não houver, deletar.
- **Status:** `[ ]`

### [CHORE-003] Remover `async def` de `add_coins()` (DB é síncrono)
- **Prioridade:** 🔵 Baixo (após BUG-002)
- **Tamanho:** XS
- **Arquivo:** `backend/services/gamification.py` linha 45
- **Status:** `[ ]`

### [CHORE-004] Padronizar nomenclatura de nomes em `installers`
- **Prioridade:** 🔵 Baixo
- **Arquivo:** `backend/db_supabase.py` — tabela `installers` tem `full_name`; tabela `users` tem `name` e `full_name`
- **Problema:** Campos redundantes/inconsistentes entre tabelas relacionadas.
- **Status:** `[ ]`

---

## ✅ Concluído (referência — sessão 2026-05-08)

| ID | Descrição | Arquivo |
|---|---|---|
| BUG-F01 | 6 erros silenciosos em useCatalogos | `frontend/src/hooks/useCatalogos.js` |

---

## Como usar este backlog

```bash
# Ver tarefas pendentes críticas
grep -A1 "Status.*\[ \]" TASKS.md | grep "Prioridade.*🔴"

# Marcar como concluída: substituir [ ] por [x]
# Marcar como em progresso: substituir [ ] por [~]
```
