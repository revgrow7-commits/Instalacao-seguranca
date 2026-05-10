# ADR-0001: Wrapper MongoDB-like sobre Supabase PostgreSQL

**Data:** 2026-05-08  
**Status:** Aceito  
**ID:** ARCH-001

---

## Contexto

O backend foi originalmente construído usando MongoDB como banco de dados, com sintaxe de queries estilo `find({...})`, `insert_one()`, `update_one({}, {"$set": {...}})`, etc. Em algum momento foi feita a migração para Supabase (PostgreSQL), mas reescrever todas as queries seria caro.

## Decisão

Criar `db_supabase.py` com a classe `SupabaseTable` que expõe a mesma API do PyMongo, traduzindo internamente para chamadas Supabase PostgREST:

```python
db.jobs.find({"status": "AGUARDANDO"})
# → supabase.table("jobs").select("*").eq("status", "AGUARDANDO").execute()

db.jobs.update_one({"id": id}, {"$set": {"status": "INSTALANDO"}})
# → supabase.table("jobs").update({"status": "INSTALANDO"}).eq("id", id).execute()
```

Inclui suporte a `$set`, `$inc` (read-then-write), `$push`, `$or`, `$in`, `$gte/$lte`, `$regex` → `ilike`.

## Consequências

**Positivas:**
- Toda a lógica de negócio existente migrou sem reescrita
- `_filter_columns()` protege contra erros 400 por campos desconhecidos no PostgREST
- Campos JSONB tratados nativamente (sem `json.dumps`/`json.loads`)

**Negativas:**
- Esconde recursos SQL poderosos (joins nativos, transações, RPCs, aggregates)
- `$inc` é NÃO atômico — read-then-write expõe race condition (ver ARCH-003)
- `update_many()` delega para `update_one()` — bug latente (ver BUG-003 em TASKS.md)
- `aggregate()` retorna `find({})` — sem suporte real a aggregations

**Manutenção:** Ao adicionar coluna em migration SQL, sempre atualizar `TABLE_COLUMNS` em `db_supabase.py`, senão o campo é descartado silenciosamente por `_filter_columns()`.
