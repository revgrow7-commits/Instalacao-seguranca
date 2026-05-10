# ADR-0002: JWT expira em 1 dia no backend, 7 dias no frontend

**Data:** 2026-05-08  
**Status:** Aceito  
**ID:** ARCH-002

---

## Contexto

O sistema é usado principalmente por instaladores em campo via celular. Forçar re-login diário prejudica a experiência — o app abre em plena instalação e o instalador está sem acesso.

## Decisão

- **Backend (`config.py`):** `ACCESS_TOKEN_EXPIRE_DAYS = 1` — JWT válido por 1 dia
- **Frontend (`tokenManager.js`):** `setToken(token, expiresInDays = 7)` — armazena por 7 dias

O `AuthContext` captura o HTTP 401 em `GET /api/auth/me` e faz logout automático, então o usuário percebe a expiração apenas na próxima abertura do app (não durante uso ativo).

## Consequências

**Positivas:**
- Instaladores não precisam re-autenticar durante uso contínuo no dia seguinte
- Expiração real controlada pelo backend — frontend só controla limpeza de storage

**Negativas:**
- Entre os dias 2–7, o token no `localStorage` existe mas o backend rejeita — usuário vê tela de login ao abrir o app
- Tokens comprometidos ficam no `localStorage` por até 7 dias antes de expirar automaticamente
- Revogação de token não é possível sem invalidação server-side (não implementada)

**Mitigação:** Para revogar um token imediatamente (ex: demissão de instalador), desativar o usuário no banco (`is_active = false`) — o `get_current_user()` verifica o status ao decodificar o JWT.
