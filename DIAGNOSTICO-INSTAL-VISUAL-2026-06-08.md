# Diagnóstico Instal-Visual — 2026-06-08

**Status**: Frontend funcional ✅, Backend inacessível ❌

## Problemas Críticos Corrigidos

### 1. Incompatibilidade Starlette 1.0.0 ✅ CORRIGIDO
- **Sintoma**: `FUNCTION_INVOCATION_FAILED` em todos os endpoints
- **Causa**: Starlette 1.0.0 removeu parâmetro `on_startup` que FastAPI 0.110.1 usa
- **Solução**: Fixado `starlette>=0.37.2,<1.0.0` no requirements.txt
- **Commit**: 48ef26a

### 2. CORS_ORIGINS não configurado ✅ CORRIGIDO
- **Sintoma**: RuntimeError ao inicializar servidor
- **Causa**: Verificação rigorosa na linha 227-230 de server.py
- **Solução**: Adicionado padrão sensato para produção/staging
- **Commit**: 3860f21

### 3. Roteamento Backend mal configurado ✅ CORRIGIDO
- **Sintoma**: Requisições a `/_/backend/*` retornavam HTML
- **Causa**: Routes em backend/vercel.json muito específicas
- **Solução**: Simplificado para catch-all `/(.*)`
- **Commit**: 0eb692b

### 4. experimentalServices não funciona ✅ REMOVIDO
- **Sintoma**: `/_/backend/*` ainda retorna HTML  
- **Causa**: Monorepo setup com experimentalServices não está unificando
- **Solução**: Removido experimentalServices, foco em frontend
- **Commit**: 1688b89

## Problema Remanescente — PENDENTE INVESTIGAÇÃO

### Backend Inacessível ❌ CRÍTICO
- **Sintoma**: `/_/backend/api/*` retorna 403 com HTML Astro
- **Afetação**: Aplicação 100% inoperável (sem API)
- **Causa**: Desconhecida - 3 hipóteses principais

### URLs Testadas

| URL | Status | Resposta |
|-----|--------|----------|
| `https://instal-visual.com.br/login` | 200 | HTML React ✅ |
| `https://instal-visual.com.br/_/backend/health` | 403 | HTML Astro ❌ |
| `https://instal-visual.com.br/_/backend/api/auth/me` | 403 | HTML Astro ❌ |

## Próximos Passos (P0 CRÍTICO)

1. Verificar Vercel Dashboard - confirmar 2 projetos deployados
2. Descobrir URL real do backend Vercel
3. Configurar REACT_APP_BACKEND_URL corretamente no frontend
4. Verificar se há WAF/Cloudflare bloqueando

## Commits Realizados

- 48ef26a: Fix Starlette version
- 3860f21: Fix CORS_ORIGINS with defaults
- 0eb692b: Fix backend vercel.json
- 1688b89: Remove experimentalServices
