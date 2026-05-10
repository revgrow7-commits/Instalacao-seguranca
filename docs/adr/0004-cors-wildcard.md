# ADR-0004: CORS wildcard como default — risco de segurança em produção

**Data:** 2026-05-08  
**Status:** Precisa de ação — configurar env em produção  
**ID:** ARCH-004

---

## Contexto

A configuração CORS em `server.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Se `CORS_ORIGINS` não estiver configurada no Vercel, o servidor aceita requests de qualquer origem com credenciais.

## Decisão

Aceitar o wildcard em desenvolvimento local (sem env configurada). Para produção, a env `CORS_ORIGINS` **deve** estar configurada no Vercel dashboard.

## Ação requerida

No Vercel dashboard do projeto instal-visual → Settings → Environment Variables:

```
CORS_ORIGINS=https://instal-visual.com.br,https://somos-industriavisual.com.br
```

## Consequências

**Sem configurar:**
- Qualquer site pode fazer requests autenticados para a API com cookies/tokens de usuários logados
- Risco de CSRF se autenticação for baseada em cookies (não é o caso — usa Bearer token, mitigado)

**Com Bearer token (situação atual):**
- CORS wildcard com Bearer token é menos crítico — o atacante ainda precisa do token
- Principal risco é API scraping e abuso de endpoints públicos (register, forgot-password)

**Após configurar env:**
- Requests de origens não listadas recebem erro CORS antes mesmo de chegar ao handler
