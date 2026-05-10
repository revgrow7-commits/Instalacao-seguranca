# Architecture Decision Records (ADRs)

Registros de decisões arquiteturais do projeto **instal-visual** (instal-supa).

## Índice

| ADR | Título | Status |
|---|---|---|
| [0001](0001-db-wrapper-mongodb.md) | Wrapper MongoDB-like sobre Supabase PostgreSQL | Aceito |
| [0002](0002-jwt-expiry-assimetria.md) | JWT expira em 1 dia no backend, 7 dias no frontend | Aceito |
| [0003](0003-inc-nao-atomico.md) | `$inc` e `add_coins()` não atômicos — dívida técnica | Aceito (migração pendente) |
| [0004](0004-cors-wildcard.md) | CORS wildcard como default | Precisa de ação em produção |
| [0005](0005-foto-checkin-storage.md) | Fotos de check-in com fallback base64 | Aceito |

## Template

```markdown
# ADR-NNNN: Título

**Data:** YYYY-MM-DD  
**Status:** Proposto / Aceito / Depreciado / Substituído por ADR-XXXX

## Contexto
[Problema que gerou a decisão]

## Decisão
[O que foi decidido e como]

## Consequências
[Positivas, negativas, ações requeridas]
```
