# Plano de Melhoria — Indústria Visual (instal-visual.com.br)

**Data:** 05/06/2026 · **Complementa:** `AUDITORIA-PRE-PRODUCAO.md` (relatório original) e `AUDITORIA-STATUS.md` (status)

> **Contexto importante:** parte dos problemas da auditoria original **já foi corrigida** nesta frente de trabalho (senha forte + rate limiting, credencial em env, enumeração de e-mail, segredo do cron, feedback de erro, `$inc` atômico, `find/find_one` que engoliam erros). Este plano analisa o **estado atual** do código nas 8 dimensões pedidas e lista o que ainda falta, em ordem de prioridade — segurança e performance primeiro.

---

## PARTE 1 — Análise por dimensão

### 1. Arquitetura (separação em camadas)
**Nota: boa no desenho, furada na prática.** A estrutura de pastas é correta — frontend com `pages/`, `components/`, `hooks/`, `lib/`, `utils/`, `context/`; backend com `routes/`, `services/`, `models/`. O problema é que a separação não é respeitada nos arquivos grandes: `backend/routes/jobs.py` (2.100+ linhas) mistura rota HTTP, regra de negócio, integração Holdprint e envio de e-mail no mesmo arquivo — "rota" virou "tudo". No frontend, `Checkins.jsx` (735 linhas) define 3 componentes e lógica de negócio no mesmo arquivo. → **Problemas P7 e P8.**

### 2. Boas práticas (nomes, funções pequenas, responsabilidade única)
**Nota: razoável.** Nomes em geral são descritivos (`checkGoogleStatus`, `detect_product_family`, `validar_forca_senha`). Os pontos fracos: funções de rota gigantes em `jobs.py`, lógica de negócio dentro de JSX (`isLate` em `Checkins.jsx`), números mágicos espalhados (4h, 768px, 1024px, 500m) e duplicação real (`compress_base64_image` copiada em 2 arquivos; paginação Holdprint em 2 lugares). → **Problemas P8 e P9.**

### 3. Segurança
**Nota: boa após as correções desta semana.** Já resolvido: senha mínima 8+ com complexidade, rate limiting de login, anti-enumeração no forgot-password, segredo obrigatório no cron, credencial fora do código, CORS com origens explícitas, rotas protegidas com `Depends(get_current_user)`, inputs validados com Pydantic, zero `dangerouslySetInnerHTML`/`eval` no frontend (React escapa por padrão). **Resta:** token JWT em `localStorage` (vulnerável a XSS — maior pendência de segurança), `allow_methods=["*"]` no CORS, e tokens Google salvos sem criptografia no banco. → **Problemas P1 e P9.**

### 4. Performance (React.memo, useCallback, useMemo)
**Nota: parcial.** Bons sinais: lazy loading de todas as páginas, `useMemo` correto na filtragem de `Checkins.jsx`, cache no wrapper Axios. Faltas concretas: `MiniCheckinCard` renderizado em lista sem `React.memo` e com callbacks recriados a cada render (com 100+ check-ins, o scroll trava); handlers como `checkGoogleStatus` sem `useCallback`. → **Problema P4.**

### 5. Testes
**Nota: ZERO. É a maior lacuna estrutural do projeto.** Não existe nenhum arquivo de teste próprio — nem `*.test.js` no frontend (só em `node_modules`), nem `test_*.py` no backend. Toda verificação é manual. Qualquer refactor (incluindo os deste plano) é feito "no escuro". A prioridade não é cobertura total, e sim proteger **comportamentos críticos**: login (com throttle), política de senha, reset de senha, regras de check-in/checkout com GPS. → **Problema P5.**

### 6. TypeScript (tipos corretos, sem `any`)
**Nota: não se aplica — e isso é o achado.** O frontend é JavaScript puro: não há `any` porque não há tipo nenhum. Não existe nem `PropTypes` nem `JSDoc` nos hooks/componentes de dados. O backend compensa parcialmente com Pydantic (models tipados). Migração big-bang para TS seria arriscada; o caminho é gradual. → **Problema P6.**

### 7. Escalabilidade
**Nota: o gargalo nº 1 está identificado.** `list_jobs` (`jobs.py:352`) carrega **todos** os jobs do banco em cada chamada, sem paginação — com o crescimento da base, isso vira timeout serverless (limite Vercel) e memória estourada. O wrapper `find()` **já suporta** `limit`/`skip`, então a correção é barata. O resto é saudável: índices criados em migrations, bulk-fetch anti-N+1 no `location-alerts`, fotos em Storage com URL (não no banco). → **Problema P2.**

### 8. Manutenibilidade
**Nota: boa documentação, arquivos grandes demais.** Pontos fortes raros em projetos assim: `CLAUDE.md` rico, ADRs documentados, migrations versionadas, `hooks/README.md`. Pontos fracos: os arquivos-monstro (P7), código morto da gamificação desativada (P8) e o risco crônico do wrapper MongoDB-like (campos fora do `TABLE_COLUMNS` são descartados em silêncio — mitigado por disciplina, não por código).

---

## PARTE 2 — Planejamento de melhoria passo a passo

Ordenado por prioridade (segurança → performance → resto). Cada item: problema, solução com ANTES/DEPOIS e o benefício.

---

### 🔴 P1 — Token de login guardado em localStorage (SEGURANÇA — M8)

**Problema simples:** o "crachá" de login (JWT) fica num lugar que qualquer script da página consegue ler. Se uma biblioteca de terceiros for comprometida (ataque XSS), o invasor rouba o crachá e vira o usuário.

**ANTES** (`frontend/src/utils/tokenManager.js`):
```javascript
setToken: (token, expiresInDays = 7) => {
  localStorage.setItem(TOKEN_KEY, sanitized);   // legível por qualquer JS da página
  ...
}
```

**DEPOIS — em duas etapas:**

*Etapa A (barata, fazer já): CSP para reduzir a superfície de XSS.* Em `vercel.json` do frontend:
```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "default-src 'self'; script-src 'self'; connect-src 'self' https://instal-visual.com.br https://*.supabase.co; img-src 'self' data: https://*.supabase.co; style-src 'self' 'unsafe-inline'"
    }]
  }]
}
```

*Etapa B (definitiva): cookie HttpOnly.* O backend passa a setar o token num cookie que o JavaScript não consegue ler:
```python
# backend: no login()
response.set_cookie(
    "access_token", access_token,
    httponly=True, secure=True, samesite="lax",
    max_age=7 * 24 * 3600,
)
```
```javascript
// frontend: axios passa a enviar o cookie automaticamente
const api = axios.create({ baseURL: ..., withCredentials: true });
// tokenManager.js deixa de gravar o token
```

**Benefício:** elimina o principal vetor de sequestro de conta por XSS. A Etapa A protege já com 10 linhas; a Etapa B exige ajustar `get_current_user` para ler o cookie e testar bem o fluxo móvel dos instaladores (por isso é etapa separada).

---

### 🔴 P2 — Listagem de jobs sem paginação (PERFORMANCE/ESCALABILIDADE — M7)

**Problema simples:** a tela de jobs pede "todos os jobs de uma vez". Com 10 mil jobs, a resposta fica gigante, lenta, e o servidor serverless estoura o tempo limite.

**ANTES** (`backend/routes/jobs.py:352`):
```python
jobs = db.jobs.find(query, projection)   # carrega TUDO
```

**DEPOIS** (o wrapper `find` já aceita `limit`/`skip` — correção barata):
```python
@router.get("/jobs", response_model=List[Job])
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    jobs = db.jobs.find(
        query, projection,
        sort=[("created_at", -1)],
        limit=page_size,
        skip=(page - 1) * page_size,
    )
```
No frontend, o hook `useJobs` passa `?page=1&page_size=50` e adiciona um botão "carregar mais" (ou scroll infinito).

**Benefício:** tempo de resposta e memória constantes para sempre, independente do volume. É a diferença entre o sistema aguentar 1.000 ou 100.000 jobs.

---

### 🟡 P3 — Error Boundary único e sem recuperação (RESILIÊNCIA — M9)

**Problema simples:** existe um "airbag" global, mas é um só para o app inteiro, a mensagem manda o usuário recarregar com atalho de teclado, e ninguém da equipe fica sabendo do erro.

**ANTES** (`frontend/src/App.js:14-28`):
```javascript
if (this.state.hasError) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
      <p>Erro no app, recarregue a página (Ctrl+Shift+R) para limpar cache.</p>
    </div>
  );
}
```

**DEPOIS:**
```javascript
componentDidCatch(error, info) {
  console.error('ErrorBoundary caught:', error, info);
  // enviar para monitoramento (Sentry é grátis no plano inicial)
  reportError?.(error, info);
}
render() {
  if (this.state.hasError) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <p>Algo deu errado nesta tela.</p>
        <button onClick={() => this.setState({ hasError: false })}>
          Tentar novamente
        </button>
      </div>
    );
  }
  return this.props.children;
}
```
E envolver cada rota crítica com seu próprio boundary:
```javascript
<Route path="/installer/job/:id" element={
  <ErrorBoundary><InstallerJobDetail /></ErrorBoundary>
} />
```

**Benefício:** uma falha no calendário não derruba o check-in; o usuário tem uma saída de 1 clique; a equipe descobre erros por telemetria em vez de por reclamação.

---

### 🟡 P4 — Lista de check-ins re-renderiza tudo (PERFORMANCE — R3)

**Problema simples:** a cada digitação no filtro, TODOS os cards da lista são redesenhados — mesmo os que não mudaram. Com 100+ check-ins, trava no celular.

**ANTES** (`frontend/src/pages/Checkins.jsx`):
```javascript
const MiniCheckinCard = ({ checkin, onView, onDelete, ... }) => { ... };
// handlers recriados a cada render da página:
const handleView = (checkin) => { ... };
```

**DEPOIS:**
```javascript
const MiniCheckinCard = React.memo(({ checkin, onView, onDelete, ... }) => { ... });

const handleView = useCallback((checkin) => { ... }, []);
const handleDelete = useCallback((id) => { ... }, []);
// (mesmo para onArchive / onWhatsApp)
```

**Benefício:** só o card que mudou é redesenhado. Scroll fluido no campo, onde os instaladores usam celulares modestos em 3G/4G.

---

### 🟡 P5 — Zero testes no projeto inteiro (TESTES)

**Problema simples:** não existe nenhum teste automatizado. Cada mudança pode quebrar algo sem ninguém perceber até um usuário reclamar.

**DEPOIS — começar pelos comportamentos críticos (não pela cobertura):**

Backend (`backend/tests/test_auth.py`, com pytest + httpx):
```python
def test_login_errado_5x_bloqueia_a_sexta(client):
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "x@y.com", "password": "errada1"})
    r = client.post("/api/auth/login", json={"email": "x@y.com", "password": "errada1"})
    assert r.status_code == 429  # bloqueado — comportamento, não implementação

def test_senha_fraca_rejeitada(client):
    r = client.post("/api/auth/register", json={..., "password": "abc123"})
    assert r.status_code == 400  # menos de 8 caracteres
```

Frontend (`ForgotPassword.test.jsx`, com React Testing Library — já vem no CRA):
```javascript
test('mostra estado de sucesso após enviar o e-mail', async () => {
  render(<ForgotPassword />);
  await userEvent.type(screen.getByLabelText(/e-mail/i), 'a@b.com');
  await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
  expect(await screen.findByText(/email enviado/i)).toBeInTheDocument();
});
```

**Benefício:** os fluxos que custam dinheiro quando quebram (login, senha, check-in) ficam protegidos contra regressão. Testes de comportamento (o que o usuário vê) sobrevivem a refactors — testes de implementação, não.

---

### 🟢 P6 — Sem tipagem (TYPESCRIPT — R1)

**Problema simples:** sem tipos, um campo digitado errado (`instaler_id`) só explode em produção.

**DEPOIS — gradual, sem big-bang:** (1) `// @ts-check` + JSDoc nos hooks de dados:
```javascript
/**
 * @returns {{ vendedores: {value: string, label: string}[], loading: boolean, error: boolean }}
 */
export function useCatalogos() { ... }
```
(2) novos arquivos nascem `.tsx`; (3) converter `utils/api.js` e `hooks/` primeiro (são a fronteira com os dados).

**Benefício:** autocompletar e erro em tempo de edição, sem parar o desenvolvimento para reescrever tudo.

---

### 🟢 P7 — Arquivos-monstro (ARQUITETURA/MANUTENIBILIDADE — R2)

**Problema simples:** `jobs.py` (2.100+ linhas), `Checkins.jsx` (735), `auth_new.py` (650+). Mexer num canto quebra outro.

**DEPOIS:** extrair por responsabilidade, sem mudar comportamento:
```
backend/routes/jobs.py        → rotas CRUD finas
backend/services/holdprint.py → toda a integração Holdprint (sync, paginação, e-mail)
frontend/components/checkins/MiniCheckinCard.jsx
frontend/components/checkins/Cronometer.jsx
frontend/lib/checkinUtils.js  → isCheckinLate() e afins
```

**Benefício:** cada arquivo conta uma história só; o P5 (testes) fica muito mais fácil porque lógica extraída é testável isoladamente. *Fazer DEPOIS do P5 — refactor sem teste é andar sem corda.*

---

### 🟢 P8 — Números mágicos e código morto (BOAS PRÁTICAS — R4/R5)

**ANTES:** `return hours >= 4;` · `window.innerWidth < 768` · `MAX_WIDTH = 1024` · blocos comentados de gamificação + `LojaFaixaPreta.jsx`/`GamificationReport.jsx` órfãos.

**DEPOIS:** `frontend/src/lib/constants.js`:
```javascript
export const CHECKIN_ATRASO_HORAS = 4;
export const MOBILE_BREAKPOINT_PX = 768;
export const IMAGE_MAX_PX = 1024;
```
E deletar o código morto (o histórico fica no Git — `git log` recupera tudo se a gamificação voltar).

**Benefício:** mudar uma regra de negócio vira edição de 1 linha em 1 lugar; menos confusão para quem chegar depois.

---

### 🟢 P9 — Endurecimentos menores de segurança (R7 + observações)

1. `backend/server.py`: `allow_methods=["*"]` → `allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]`.
2. `cs_integration.py:19-20` e `database_supabase.py:19`: URLs do projeto vizinho fixas no código → mover para env (`CS_INTEGRATION_URL`). São URLs, não chaves — organização, não vazamento.
3. Tokens Google em texto puro no banco (`google_tokens`) → criptografar com Supabase Vault quando houver fôlego.

**Benefício:** reduz superfície de ataque e termina a faxina de configuração.

---

## Ordem de execução recomendada

| # | Item | Dimensão | Esforço | Quando |
|---|------|----------|---------|--------|
| 0 | Rodar migrations 038/039 + envs Vercel (pendências) | Segurança | 15 min | **Antes do deploy** |
| 1 | P1-A — CSP no vercel.json | Segurança | Baixo | Já |
| 2 | P2 — Paginação de jobs | Performance | Baixo | Já |
| 3 | P3 — Error Boundary granular + retry | Resiliência | Médio | Esta semana |
| 4 | P4 — React.memo/useCallback na lista | Performance | Baixo | Esta semana |
| 5 | P5 — Testes dos fluxos críticos | Testes | Médio | Antes de refactors |
| 6 | P1-B — Cookie HttpOnly | Segurança | Alto | Sprint seguinte |
| 7 | P7 — Quebrar arquivos-monstro | Manutenib. | Alto | Depois do P5 |
| 8 | P6 / P8 / P9 — tipagem, constantes, faxina | Qualidade | Contínuo | Conforme tocar nos arquivos |

**Pré-requisito para tudo:** liberar espaço em disco no PC para o ambiente de testes voltar a funcionar — hoje nada pode ser validado com build/teste real.
