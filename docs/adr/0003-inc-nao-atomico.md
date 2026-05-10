# ADR-0003: `$inc` e `add_coins()` são não atômicos — aceitos como dívida técnica

**Data:** 2026-05-08  
**Status:** Aceito provisoriamente — ver BUG-001 em TASKS.md  
**ID:** ARCH-003

---

## Contexto

O operador `$inc` no wrapper `db_supabase.py` e a função `add_coins()` em `services/gamification.py` usam o padrão read-then-write:

1. Lê o valor atual
2. Calcula o novo valor em Python
3. Escreve o novo valor

Se dois processos executam simultaneamente para o mesmo instalador (ex: dois checkouts quase simultâneos), a segunda escrita sobrescreve a primeira — perdendo um incremento.

## Decisão

Aceitar como dívida técnica para MVP. A frequência de checkouts simultâneos para o mesmo instalador é extremamente baixa na prática.

## Correção correta (pendente)

Criar RPC Supabase atômica:

```sql
CREATE OR REPLACE FUNCTION increment_field(
  p_table TEXT, p_id UUID, p_field TEXT, p_delta NUMERIC
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET %I = %I + $1 WHERE id = $2',
    p_table, p_field, p_field
  ) USING p_delta, p_id;
END;
$$;
```

Usar: `supabase.rpc("increment_field", {"p_table": "installers", "p_id": id, "p_field": "coins", "p_delta": 10})`

## Consequências

**Enquanto não migrado:**
- Risco de perda de moedas em checkouts simultâneos (~< 1s de diferença)
- `total_jobs` e `total_area_installed` podem ficar imprecisos

**Após migração:**
- Elimina race condition completamente
- Remove fetch prévio do valor (2 queries → 1 query)
