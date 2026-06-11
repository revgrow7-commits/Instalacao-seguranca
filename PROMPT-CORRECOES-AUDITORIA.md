# Prompt — Correções da Auditoria Pré-Produção

Aplique as correções priorizadas da auditoria de 2026-06-10 no projeto instal-visual.com.br.
Pasta raiz: `C:\Users\andre\Downloads\claude\Instal-supa\supabase`

---

## PRIORIDADE 1 — Bloqueadores (corrigir agora, antes do próximo deploy)

### BLOQ-01 — Loading infinito em `Users.jsx`

**Arquivo:** `frontend/src/pages/Users.jsx` ~linha 36

**Problema:** `loadData()` só é chamado se `isAdmin === true`. Se o usuário for manager, `setLoading(false)` nunca é chamado e o spinner trava para sempre.

**Correção exata:**
```js
// ANTES:
useEffect(() => {
  if (isAdmin) {
    loadData();
  }
}, [isAdmin]);

// DEPOIS:
useEffect(() => {
  if (isAdmin) {
    loadData();
  } else {
    setLoading(false);
  }
}, [isAdmin]);
```

---

### BLOQ-02 — Crash em `Checkins.jsx` — installers sem fallback

**Arquivo:** `frontend/src/pages/Checkins.jsx` ~linha 338

**Problema:** `setInstallers(installersRes.data)` pode receber `undefined` em rede lenta, causando TypeError em qualquer `.map()` ou `.find()` subsequente.

**Correção exata:**
```js
// ANTES:
setInstallers(installersRes.data);

// DEPOIS:
setInstallers(installersRes.data || []);
```

---

### BLOQ-03 — CSP para mitigar risco XSS no JWT em localStorage

**Arquivo:** `vercel.json` (raiz do projeto)

**Problema:** JWT admin em localStorage é vulnerável a XSS. Adicionar Content-Security-Policy como camada de defesa.

**Correção:** Adicionar headers de CSP no `vercel.json`. Leia o arquivo atual primeiro e adicione a seção de headers preservando o restante da configuração. Exemplo do que adicionar:

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      {
        "key": "Content-Security-Policy",
        "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://instal-visual.com.br; font-src 'self' data:; frame-ancestors 'none'"
      },
      {
        "key": "X-Content-Type-Options",
        "value": "nosniff"
      },
      {
        "key": "X-Frame-Options",
        "value": "DENY"
      }
    ]
  }
]
```

**ATENÇÃO:** Leia o `vercel.json` atual antes de editar para não quebrar o roteamento `experimentalServices` existente. Adicione a seção `"headers"` sem remover nada.

---

## PRIORIDADE 2 — Deve corrigir (próximo sprint)

### CORR-04 — Bypass de expiração de token de reset

**Arquivo:** `backend/routes/auth_new.py` ~linhas 498-511

**Problema:** `raise HTTPException` para token expirado está dentro do `try`, antes do `except ValueError`. Se o parse de data falhar com outro erro, o token expirado não é invalidado.

**Correção:**
```python
# ANTES:
try:
    expires_at = datetime.fromisoformat(...)
    if datetime.now(timezone.utc) > expires_at:
        db.password_resets.delete_one({"token": request.token})
        raise HTTPException(...)
except ValueError as e:
    logger.error(...)

# DEPOIS:
try:
    expires_at = datetime.fromisoformat(...)
except ValueError as e:
    logger.error(f"Error parsing expiry date: {e}")
    expires_at = None

if expires_at and datetime.now(timezone.utc) > expires_at:
    db.password_resets.delete_one({"token": request.token})
    raise HTTPException(status_code=400, detail="Token expirado.")
```

---

### CORR-06 — Inconsistência phone/branch em `update_user`

**Arquivo:** `backend/routes/users.py` ~linha 44

**Problema:** `phone` e `branch` são excluídos do `update_data` da tabela `users`, mas são usados para atualizar a tabela `installers`. Cria inconsistência de dados entre as duas tabelas.

**Ação:** Leia o arquivo e avalie se a exclusão é intencional. Se não for, remova `phone` e `branch` da lista de exclusão:
```python
# ANTES:
update_data = {k: v for k, v in user_data.items() if k not in ['id', 'created_at', 'password', 'phone', 'branch']}

# DEPOIS (se não intencional):
update_data = {k: v for k, v in user_data.items() if k not in ['id', 'created_at', 'password']}
```

---

### CORR-08 — Emails hardcoded em `jobs.py`

**Arquivo:** `backend/routes/jobs.py` ~linhas 113, 2193

**Problema:** Emails pessoais hardcoded são retornados no response JSON, expondo dados internos.

**Correção:**
1. Em `backend/config.py`, adicionar:
   ```python
   NOTIFICATION_EMAILS = [e.strip() for e in os.environ.get('NOTIFICATION_EMAILS', '').split(',') if e.strip()]
   ```
2. Em `jobs.py`, importar de config e substituir a lista hardcoded
3. No response, substituir `"emails_sent_to": NOTIFICATION_EMAILS` por `"emails_sent": len(NOTIFICATION_EMAILS)`
4. Adicionar `NOTIFICATION_EMAILS` às env vars do Vercel com o valor atual dos emails

---

### CORR-09 — Default hardcoded em VAPID_CLAIMS_EMAIL

**Arquivo:** `backend/config.py` ~linha 47

**Correção:**
```python
# ANTES:
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'bruno@industriavisual.com.br')

# DEPOIS:
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'noreply@instal-visual.com.br')
```

---

### CORR-05 — Cache sem TTL em `visitas.py`

**Arquivo:** `backend/routes/visitas.py` ~linhas 59-69

**Problema:** `_installer_name_cache` não tem TTL — instâncias serverless warm podem mostrar nomes antigos indefinidamente.

**Correção:** Adicionar TTL de 300s seguindo o padrão já usado em `item_checkins.py`:
```python
import time
_installer_name_cache: dict = {}
_installer_name_cache_ts: dict = {}
_INSTALLER_CACHE_TTL = 300

def _enrich_installer_name(doc: dict) -> dict:
    installer_id = doc.get("installer_id")
    if not installer_id:
        return doc
    now = time.time()
    if installer_id not in _installer_name_cache or \
       now - _installer_name_cache_ts.get(installer_id, 0) > _INSTALLER_CACHE_TTL:
        rec = db.installers.find_one({"id": installer_id})
        _installer_name_cache[installer_id] = rec.get("full_name", "") if rec else ""
        _installer_name_cache_ts[installer_id] = now
    doc["installer_name"] = _installer_name_cache[installer_id]
    return doc
```

---

## PRIORIDADE 3 — Melhorias rápidas (< 5 min cada)

### MELHO-05 — Copyright desatualizado em `Login.jsx`

**Arquivo:** `frontend/src/pages/Login.jsx` ~linha 117

```jsx
// ANTES:
<p>© 2025 INDÚSTRIA VISUAL</p>

// DEPOIS:
<p>© {new Date().getFullYear()} INDÚSTRIA VISUAL</p>
```

---

### MELHO-03 — Toast de warning em `Calendar.jsx` quando VTs falharem

**Arquivo:** `frontend/src/pages/Calendar.jsx` ~linha 108

```js
// ANTES:
api.listVisitas().catch(() => ({ data: [] })),

// DEPOIS:
api.listVisitas().catch(err => {
  console.warn('[Calendar] listVisitas falhou:', err?.message);
  toast.warning('Não foi possível carregar visitas técnicas');
  return { data: [] };
}),
```

---

## ORDEM DE EXECUÇÃO RECOMENDADA

1. ✅ BLOQ-01 (5 min) — Users.jsx loading infinito
2. ✅ BLOQ-02 (2 min) — Checkins.jsx crash
3. ✅ MELHO-05 (1 min) — Copyright
4. ✅ CORR-09 (2 min) — VAPID email
5. ✅ CORR-08 (20 min) — Emails hardcoded
6. ✅ CORR-04 (15 min) — Reset password bypass
7. ✅ CORR-06 (10 min) — phone/branch inconsistência
8. ✅ CORR-05 (15 min) — Cache TTL visitas
9. ✅ MELHO-03 (5 min) — Calendar toast
10. 🔴 BLOQ-03 (30 min) — CSP no vercel.json (último, requer teste cuidadoso)

**Após cada grupo de mudanças no frontend:** rodar `npm run build` para confirmar sem erros.
**Após mudanças no backend:** verificar imports e testar as rotas afetadas.

**NÃO deletar** os arquivos `.env*` redundantes sem confirmação explícita do usuário.
**NÃO mexer** em migrations, PENDING-001/004 ou gamificação sem instrução explícita.

---

*Baseado na auditoria AUDITORIA-CODIGO-2026-06-10.md*
