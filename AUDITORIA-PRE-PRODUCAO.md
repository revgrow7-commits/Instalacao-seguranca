# Auditoria Pré-Produção — Indústria Visual (instal-visual.com.br)

**Data:** 05/06/2026
**Escopo auditado:** Projeto inteiro — backend (Python/FastAPI) e frontend (React)
**Stack detectado:** React 18 (Create React App, JavaScript) + FastAPI (Python) + Supabase PostgreSQL + Vercel
**Quem fez a revisão:** Tech Lead (revisão de código gerado por IA)

> **Como ler este documento (para quem não é da área):** cada problema tem um número, uma cor de gravidade, uma explicação em linguagem simples, o trecho de código "como está hoje" e "como deveria ficar", e o porquê da mudança. Comece pelos 🔴 vermelhos — são os que travam o lançamento. Os 🟡 amarelos devem ser resolvidos antes de subir. Os 🟢 verdes são melhorias que podem vir depois.

---

## Resumo executivo

- 🔴 Bloqueadores de produção: **1**
- 🟡 Deve corrigir antes do deploy: **9**
- 🟢 Melhorias recomendadas: **7**

O projeto está **estruturalmente bom**: já tem Error Boundary global, lazy loading das páginas, uso de `useMemo` em pontos certos, CORS configurado corretamente (com lista explícita de origens) e proteção de autenticação na maioria das rotas. Não é um caso de "vibe code quebrado". Porém, **ainda não está pronto para produção** por causa de **um risco real de invasão de contas** (senha fraca + sem limite de tentativas de login) e de um conjunto de pontos de resiliência e segurança que degradam a experiência ou expõem dados.

**Caminho mais curto para o go-live seguro:** resolver o item 🔴 B1 (política de senha + limite de tentativas) e os itens de segurança M1, M2 e M3. Os demais 🟡 podem entrar logo na sequência.

> **Nota de honestidade técnica:** durante a varredura automática surgiram alguns "falsos alarmes" que eu verifiquei manualmente no código e **descartei** porque o código já está correto. Eles estão listados na seção "Pontos que já estão corretos" no fim — justamente para você não gastar tempo mexendo no que não precisa.

---

## 🔴 Bloqueadores de produção

### B1. Conta de instalador vulnerável a invasão (senha fraca + sem limite de tentativas)

**Onde:** `backend/routes/auth_new.py:151-155` (senha mínima) e `backend/routes/auth_new.py:72-133` (login sem limite)
**Problema:** O cadastro é público e aceita senha de apenas **6 caracteres**. Ao mesmo tempo, o endpoint de login **não tem nenhum limite de tentativas** (rate limiting). Combinados, um atacante pode testar milhões de senhas automaticamente até acertar.
**Por que bloqueia:** As contas dão acesso a dados de jobs, localização GPS e fotos de campo dos instaladores. Senha curta + tentativas ilimitadas é o caminho clássico de tomada de conta. Em um app com cadastro aberto, isso é indefensável em produção.

Como está hoje (senha):

```python
# backend/routes/auth_new.py
if len(request.password) < 6:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="A senha deve ter pelo menos 6 caracteres"
    )
```

Como está hoje (login — sem nenhuma proteção contra força bruta):

```python
@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest):
    users = db.users.find({"email": request.email.lower()})
    user = users[0] if users else None
    if not user:
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    # ...verifica senha sem contar tentativas...
```

Como deveria ficar:

```python
# 1) Exigir senha mais forte (mínimo 8, com letra e número)
import re

def validar_forca_senha(password: str):
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 8 caracteres")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="A senha deve conter letras e números")

# 2) Limitar tentativas de login (biblioteca slowapi)
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")   # no máximo 5 tentativas por minuto, por IP
def login(request: LoginRequest):
    ...
```

**Benefício:** Inviabiliza o ataque automatizado de adivinhação de senha (de horas para milhares de anos) e adiciona uma barreira de tentativas. É a correção de maior retorno de segurança do projeto inteiro.

---

## 🟡 Deve corrigir antes do deploy

### M1. Chave e URL fixas no código do frontend (em vez de variável de ambiente)

**Onde:** `frontend/src/pages/InstallerJobDetail.jsx:141-146`
**Problema:** Uma chave de API e a URL de outro projeto Supabase (o `otyrrvkixegiqsthmaaj`, do somos-industriavisual) estão escritas direto no código.

> **Contexto importante (sem alarmismo):** essa é uma chave do tipo *publishable/anon* — esse tipo de chave é **feito para ficar visível no navegador** e é protegido pelas regras de acesso (RLS) do banco. Ou seja, **não é** o vazamento catastrófico de uma senha de servidor. O problema real é outro: chave fixa no código (a) impede rotacionar a chave sem republicar o app, e (b) só é segura se o RLS do outro projeto estiver 100% correto. Por isso é 🟡 e não 🔴.

Como está hoje:

```javascript
fetch('https://otyrrvkixegiqsthmaaj.supabase.co/functions/v1/installation-list', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'sb_publishable_EuYPYtSpr2X3-rXz1PhqUg_aU0Mj9Zv',
    'Authorization': 'Bearer sb_publishable_EuYPYtSpr2X3-rXz1PhqUg_aU0Mj9Zv',
  },
  body: JSON.stringify({ holdprint_job_id: hpId }),
})
```

Como deveria ficar (chave em variável de ambiente; o ideal é o backend fazer essa chamada):

```javascript
fetch(`${process.env.REACT_APP_VISUAL_CONNECT_URL}/installation-list`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': process.env.REACT_APP_VISUAL_CONNECT_KEY,
    'Authorization': `Bearer ${process.env.REACT_APP_VISUAL_CONNECT_KEY}`,
  },
  body: JSON.stringify({ holdprint_job_id: hpId }),
})
```

**Benefício:** Permite trocar a chave sem mexer no código, separa configuração de código, e abre caminho para mover a chamada para o backend (onde a credencial fica realmente protegida).

---

### M2. O "esqueci a senha" revela se um e-mail está cadastrado

**Onde:** `backend/routes/auth_new.py:290-389`
**Problema:** O código tenta esconder quais e-mails existem (boa intenção), mas devolve o campo `email_sent: true` **somente quando o e-mail existe** e o envio dá certo. Isso permite a um atacante descobrir quais e-mails são clientes reais da plataforma.

Como está hoje:

```python
response = {"message": "Se o email existir, você receberá um link...", "email_sent": False}
users = db.users.find({"email": request.email.lower()})
user = users[0] if users else None
if not user:
    return response            # email_sent fica False
# ...se existe, envia e faz:
response["email_sent"] = True  # <- entrega que a conta existe
```

Como deveria ficar:

```python
# Resposta SEMPRE idêntica, exista ou não a conta
response = {"message": "Se o email existir, você receberá um link para redefinir sua senha."}
users = db.users.find({"email": request.email.lower()})
user = users[0] if users else None
if user:
    # gera token e dispara o e-mail (sem expor o resultado na resposta)
    ...
return response  # nunca muda em função de o usuário existir
```

**Benefício:** Remove a "pista" que permite mapear e-mails válidos — defesa padrão contra enumeração de usuários.

---

### M3. Endpoint de sincronização (cron) pode ser disparado por qualquer um

**Onde:** `backend/server.py:146-157`
**Problema:** A proteção aceita um cabeçalho `x-vercel-cron: 1` como prova de que o pedido veio do agendador da Vercel. Só que **qualquer pessoa pode enviar esse cabeçalho** numa requisição comum, e isso ignora a checagem do segredo (`CRON_SECRET`).

Como está hoje:

```python
is_vercel_cron = request.headers.get('x-vercel-cron') == '1'
cron_secret = os.environ.get('CRON_SECRET')
if cron_secret:
    auth_header = request.headers.get('Authorization', '')
    if not is_vercel_cron and auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=401, detail="Unauthorized cron request")
```

Como deveria ficar (exigir o segredo sempre; o cabeçalho não basta):

```python
cron_secret = os.environ.get('CRON_SECRET')
auth_header = request.headers.get('Authorization', '')
if not cron_secret or auth_header != f"Bearer {cron_secret}":
    raise HTTPException(status_code=401, detail="Unauthorized cron request")
```

**Benefício:** Só quem tem o segredo dispara a sincronização. O segredo configurado também é entregue ao agendador da Vercel, então o cron legítimo continua funcionando. Evita disparos manuais que poderiam duplicar/corromper jobs.

---

### M4. Contadores podem perder atualizações sob concorrência

**Onde:** `backend/db_supabase.py:438-454` (`$inc` e `$push`) e `:481-483` (`update_many`)
**Problema:** Para somar valores (ex.: `total_jobs` do instalador), o código **lê o valor atual e depois grava** (read-then-write). Se dois pedidos acontecem ao mesmo tempo, um pode sobrescrever o outro e um incremento se perde. Além disso, `update_many` apenas repassa para `update_one`, e o `$inc` calcula a partir de **um** registro — então um update em massa com `$inc` fica incorreto.

Como está hoje:

```python
elif '$inc' in update:
    existing = self.find_one(query)              # lê
    if existing:
        for field, inc_val in update['$inc'].items():
            update_data[field] = (existing.get(field, 0) or 0) + inc_val  # soma na memória e grava
# ...
def update_many(self, query, update):
    return self.update_one(query, update)        # delega — frágil para $inc/$push
```

Como deveria ficar (operação atômica no banco, via função SQL/RPC):

```sql
-- Migration: função atômica no Postgres
create or replace function increment_field(p_table text, p_id text, p_field text, p_delta int)
returns void language plpgsql as $$
begin
  execute format('update %I set %I = coalesce(%I,0) + $1 where id = $2', p_table, p_field, p_field)
  using p_delta, p_id;
end; $$;
```

```python
# No wrapper, usar a RPC para $inc em vez de read-then-write
supabase.rpc("increment_field", {"p_table": self.table_name, "p_id": doc_id,
                                 "p_field": field, "p_delta": inc_val}).execute()
```

**Benefício:** O banco faz a soma de forma atômica, eliminando a perda de incrementos. (Já consta no seu `CLAUDE.md` como PENDING-001 — esta é a correção definitiva.)

---

### M5. Falhas de carregamento ficam invisíveis para o usuário (catálogos)

**Onde:** `frontend/src/hooks/useCatalogos.js:9-19`
**Problema:** Se a API de vendedores/serviços/ferramentas falhar, o erro só vai para o console (que o usuário nunca vê). A tela mostra campos vazios sem nenhuma mensagem — o usuário acha que o sistema "está quebrado" ou que não há dados.

Como está hoje:

```javascript
api.listVendedores()
  .then(r => setVendedores((r.data || []).map(v => ({ value: v.nome, label: v.nome }))))
  .catch(err => console.error('useCatalogos: falha ao carregar vendedores', err));
// ...idem para tipos de serviço e ferramentas. Nada é exposto à tela.
```

Como deveria ficar (expor estado de carregando/erro para a tela reagir):

```javascript
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  setLoading(true);
  Promise.all([api.listVendedores(), api.listTiposServico(), api.listFerramentas()])
    .then(([v, t, f]) => {
      setVendedores((v.data || []).map(x => ({ value: x.nome, label: x.nome })));
      setTiposServico((t.data || []).map(x => ({ value: x.nome, label: x.nome })));
      setFerramentas((f.data || []).map(x => ({ value: x.nome, label: x.nome })));
    })
    .catch(() => setError('Não foi possível carregar as listas. Tente novamente.'))
    .finally(() => setLoading(false));
}, []);

return { vendedores, tiposServico, ferramentas, loading, error, /* ...adds */ };
```

**Benefício:** A tela passa a poder mostrar "carregando…" e uma mensagem de erro com opção de tentar de novo, em vez de campos vazios silenciosos.

---

### M6. Falha ao checar o Google Calendar não avisa o usuário

**Onde:** `frontend/src/pages/Calendar.jsx` (função `checkGoogleStatus`)
**Problema:** No erro, o `catch` só escreve no console. O indicador de "verificando" some, mas o usuário não recebe nenhuma mensagem dizendo que a checagem falhou.

Como está hoje:

```javascript
} catch (error) {
  console.error('Error checking Google status:', error);  // usuário não vê nada
} finally {
  setCheckingGoogleStatus(false);
}
```

Como deveria ficar:

```javascript
} catch (error) {
  toast.error('Não foi possível verificar a conexão com o Google Calendar.');
} finally {
  setCheckingGoogleStatus(false);
}
```

**Benefício:** O usuário entende que houve uma falha e pode reagir, em vez de achar que está tudo certo.

---

### M7. Listagem de jobs sem paginação (não escala)

**Onde:** `backend/routes/jobs.py:352` (e `:359`, que busca todos os check-ins ativos)
**Problema:** A rota principal de jobs busca **todos** os registros de uma vez, sem limite. Com poucos jobs funciona; com milhares, consome muita memória e pode estourar o tempo limite da Vercel (timeout).

Como está hoje:

```python
jobs = db.jobs.find(query, projection)   # sem limit, sem paginação
```

Como deveria ficar (paginação por página/tamanho):

```python
@router.get("/jobs", response_model=List[Job])
async def list_jobs(page: int = 1, page_size: int = 50, current_user: User = Depends(get_current_user)):
    offset = (page - 1) * page_size
    jobs = db.jobs.find(query, projection, limit=page_size, offset=offset)
    ...
```

**Benefício:** Tempo de resposta e uso de memória passam a ser constantes, independentemente de o banco ter 100 ou 100 mil jobs.

---

### M8. Token de login guardado no localStorage (exposto a ataques XSS)

**Onde:** `frontend/src/utils/tokenManager.js:29-42`
**Problema:** O token JWT fica no `localStorage`, que é acessível por qualquer JavaScript da página. Se alguma biblioteca de terceiros for comprometida (ataque XSS), o token pode ser roubado e a conta, sequestrada.

> É um **trade-off de arquitetura**, não um bug grosseiro — `localStorage` foi escolhido para manter o login dos instaladores no celular. Por isso é 🟡 e a correção pode ser planejada.

Como deveria ficar (caminho mais seguro): o backend define o token em um **cookie HttpOnly** (inacessível ao JavaScript), e o frontend para de gravar o token manualmente. Como mitigação intermediária mais barata, manter o atual e adicionar uma **Content-Security-Policy (CSP)** estrita para reduzir a superfície de XSS.

**Benefício:** Um cookie HttpOnly não pode ser lido por scripts, fechando o principal vetor de roubo de sessão por XSS.

---

### M9. Existe Error Boundary, mas é só um global e sem recuperação

**Onde:** `frontend/src/App.js:3-29`
**Problema:** Há um Error Boundary global (ótimo — evita a tela totalmente branca). Mas: (1) ele é único, então um erro em **qualquer** parte derruba o app inteiro; (2) a mensagem é genérica e pede para o usuário recarregar com Ctrl+Shift+R; (3) não há botão de "tentar de novo" nem envio do erro para monitoramento.

Como está hoje:

```javascript
render() {
  if (this.state.hasError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <p>Erro no app, recarregue a página (Ctrl+Shift+R) para limpar cache.</p>
      </div>
    );
  }
  return this.props.children;
}
```

Como deveria ficar (boundary por rota + botão de retry + log remoto):

```javascript
componentDidCatch(error, info) {
  // enviar para monitoramento (ex.: Sentry) em vez de só console
  reportError(error, info);
}
render() {
  if (this.state.hasError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <p>Algo deu errado nesta tela.</p>
        <button onClick={() => this.setState({ hasError: false })}>Tentar novamente</button>
      </div>
    );
  }
  return this.props.children;
}
// e envolver rotas críticas (login, checkin, calendário) em boundaries próprios,
// para que a falha de uma tela não derrube as demais.
```

**Benefício:** Isola falhas por área, dá ao usuário uma saída ("tentar novamente") e faz a equipe **descobrir** os erros via monitoramento, em vez de depender de relato de usuário.

---

## 🟢 Melhorias recomendadas

### R1. Projeto sem tipagem (sem TypeScript e sem PropTypes)

**Onde:** todo o frontend (`.jsx`/`.js`).
**Observação sobre o seu pedido:** os critérios "tipos corretos, sem `any`, tipagem completa" pressupõem TypeScript — mas **este projeto é JavaScript puro**, então não há `any` para caçar. O ponto equivalente aqui é: **falta uma camada de tipos**, o que deixa passar erros (campo trocado, dado nulo) só descobertos em runtime.
**Recomendação:** adotar TypeScript de forma gradual (começando pelos `hooks/` e por `utils/api.js`), ou, como passo mais barato, adicionar `PropTypes` nos componentes e `JSDoc` nas funções de dados. Não é para fazer tudo de uma vez.
**Benefício:** menos bugs de "campo errado/nulo", autocompletar no editor e refatorações mais seguras conforme o time cresce.

### R2. Arquivos grandes demais (uma responsabilidade por arquivo)

**Onde:** `backend/routes/jobs.py` (2100+ linhas), `frontend/src/pages/Checkins.jsx` (735 linhas), `backend/routes/auth_new.py` (584 linhas).
**Recomendação:** quebrar por responsabilidade — ex.: extrair `MiniCheckinCard`, `Cronometer` e `CheckinSkeleton` de `Checkins.jsx`; separar a integração Holdprint das rotas CRUD em `jobs.py`.
**Benefício:** mais fácil de entender, testar e modificar; reduz risco de quebrar uma coisa ao mexer em outra.

### R3. Listas re-renderizam sem necessidade (performance)

**Onde:** `frontend/src/pages/Checkins.jsx` (lista de `MiniCheckinCard`).
**Problema:** os callbacks (`onView`, `onDelete`, …) são recriados a cada render e o card não usa `React.memo`, então **todos** os cards re-renderizam mesmo quando só um muda.
**Recomendação:** `const MiniCheckinCard = React.memo(...)` + envolver os handlers em `useCallback`.
**Benefício:** rolagem fluida quando houver 100+ check-ins; menos travamento no celular.

### R4. Números "mágicos" espalhados pelo código

**Onde:** vários — ex.: `4` horas de atraso (`Checkins.jsx`), `768` px de breakpoint (`Calendar.jsx`), `1024` de compressão de imagem (`InstallerJobDetail.jsx`), `500` metros (`config.py`).
**Recomendação:** centralizar em um arquivo de constantes nomeadas (`CHECKIN_ATRASO_HORAS = 4`, `BREAKPOINT_MOBILE_PX = 768`, …).
**Benefício:** muda-se o valor num único lugar e o código fica autoexplicativo.

### R5. Código morto / comentado (gamificação desativada)

**Onde:** `frontend/src/App.js:55-57`, `backend/server.py` e arquivos órfãos `pages/LojaFaixaPreta.jsx`, `pages/GamificationReport.jsx`.
**Recomendação:** como a gamificação foi desativada em 2026-05-15, remover os blocos comentados e os arquivos que ninguém mais importa (o histórico fica no Git).
**Benefício:** menos confusão para quem mexer no código depois; evita reativação acidental.

### R6. Código duplicado

**Onde:** `compress_base64_image()` aparece em `routes/checkins.py` e `routes/item_checkins.py`; a lógica de paginação da Holdprint aparece em `routes/jobs.py` e nos services.
**Recomendação:** extrair para um único módulo compartilhado (`services/image.py`, `services/holdprint.py`).
**Benefício:** uma correção/ajuste vale para todos os usos — sem risco de corrigir num lugar e esquecer do outro.

### R7. CORS aceita todos os métodos HTTP

**Onde:** `backend/server.py:234` — `allow_methods=["*"]` com `allow_credentials=True`.
**Recomendação:** restringir aos métodos realmente usados: `allow_methods=["GET", "POST", "PUT", "DELETE"]`.
**Benefício:** endurecimento menor de segurança; reduz superfície para métodos não intencionais.

---

## Pontos que já estão corretos (não mexer)

Verifiquei manualmente e **estes itens estão bem implementados** — vários scanners apontam como problema por engano:

1. **Envio de e-mail (Resend) está protegido.** A chamada `resend.Emails.send(...)` em `auth_new.py:327-388` está dentro de `try/except`. Não é um ponto sem tratamento.
2. **CORS não é wildcard.** O `server.py:222-235` **falha rápido** se `CORS_ORIGINS` não estiver configurado e usa lista explícita de origens. (Atenção: o seu `CLAUDE.md`, item ARCH-004, está **desatualizado** dizendo que o default é `"*"` — o código atual já corrigiu isso.)
3. **Error Boundary global existe** (`App.js:3-29`) — por isso "ausência de Error Boundary" **não** é um bloqueador; o que sugiro é evoluí-lo (item M9).
4. **O webhook `/integration/schedule` está protegido** por `_verify_key(request)` (`integration.py:50`) — não é uma rota aberta.

---

## Plano de refatoração

Tarefas em ordem de execução. Itens **[BLOQ]** devem sair antes do deploy.

### Tarefa 1 — Segurança de contas e endpoints
- [ ] **[BLOQ]** Aumentar senha mínima para 8+ com letra e número (`auth_new.py`) — B1
- [ ] **[BLOQ]** Adicionar rate limiting no `/login` (e idealmente `/register`, `/forgot-password`) com `slowapi` — B1
- [ ] **[BLOQ]** Exigir `CRON_SECRET` sempre no `/cron/sync-holdprint` (não confiar no cabeçalho) — M3
- [ ] Remover o `email_sent` da resposta do `/forgot-password` (resposta sempre igual) — M2

### Tarefa 2 — Configuração e credenciais
- [ ] Mover chave/URL do Visual Connect para variável de ambiente (`InstallerJobDetail.jsx`) — M1
- [ ] (Planejar) mover a chamada do Visual Connect para o backend (proxy) — M1

### Tarefa 3 — Resiliência e feedback ao usuário
- [ ] Expor `loading`/`error` em `useCatalogos` e mostrar mensagem na tela — M5
- [ ] Adicionar `toast.error` no `catch` de `checkGoogleStatus` (`Calendar.jsx`) — M6
- [ ] Evoluir o Error Boundary: botão "tentar novamente", boundaries por rota, log remoto — M9

### Tarefa 4 — Banco e escalabilidade
- [ ] Criar RPC atômica `increment_field` e usar no `$inc`/`$push` (`db_supabase.py`) — M4
- [ ] Implementar paginação em `list_jobs` (`jobs.py`) — M7

### Tarefa 5 — Segurança de sessão (planejada)
- [ ] Migrar token para cookie HttpOnly (ou adicionar CSP estrita como mitigação) — M8

### Tarefa 6 — Qualidade e manutenção (pós-deploy)
- [ ] Adotar TypeScript gradualmente ou PropTypes/JSDoc — R1
- [ ] Quebrar arquivos gigantes (`jobs.py`, `Checkins.jsx`, `auth_new.py`) — R2
- [ ] `React.memo` + `useCallback` nas listas — R3
- [ ] Centralizar números mágicos em constantes — R4
- [ ] Remover código morto da gamificação + arquivos órfãos — R5
- [ ] Eliminar duplicação (`compress_base64_image`, paginação Holdprint) — R6
- [ ] Restringir `allow_methods` do CORS — R7

---

## Próximos passos sugeridos

1. **Fechar o bloqueador B1** (senha + rate limiting) — é a maior redução de risco com o menor esforço.
2. **Resolver M1, M2 e M3** (credencial em env, enumeração de e-mail, segredo do cron) — completam a frente de segurança para o go-live.
3. **Resolver M5 e M6** (feedback de erro ao usuário) — ganho imediato de experiência com pouco código.
4. Depois do deploy, atacar as melhorias 🟢 na ordem da Tarefa 6.
