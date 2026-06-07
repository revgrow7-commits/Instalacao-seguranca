# Análise de Gerenciamento de Estado — Frontend (Indústria Visual)

**Auditoria executada em:** 2026-05-18
**Stack:** React 18 (CRA), JavaScript, react-router-dom, axios, sonner (toasts), sem TanStack Query, sem Zustand/Redux.
**Escopo:** `frontend/src/` — 48 arquivos com `useState`, 25 pages, 8 hooks customizados, 1 Context próprio (AuthContext).

> Métricas brutas coletadas via grep: **346 chamadas de `useState`** distribuídas em 48 arquivos. **23 pages chamam `api` diretamente** em vez de usar hooks. **O hook genérico `useApiCall` está implementado e documentado, mas adotado em apenas 1 página real (Dashboard.jsx)** — o resto continua duplicando o boilerplate manualmente.

---

## Sumário Executivo

A aplicação está num ponto típico de "scale wall": o `AuthContext` está bem dimensionado, o `useApiCall` foi escrito para resolver o problema certo, mas a migração nunca aconteceu — então hoje convivem três paradigmas (raw `useEffect` + `useState`, hooks de domínio como `useJobs`, e `useApiCall`), nenhum deles dominante. O resultado é:

1. **Estado de servidor cacheado por componente, não pela aplicação** — cada navegação refaz fetch dos mesmos `/jobs`, `/installers`, `/catalogos`.
2. **Pages-monstro** com 19–46 useStates cada (InstallerJobDetail, Jobs, Calendar, UnifiedReports).
3. **Prop drilling vertical** em componentes memoizados (`JobCard` com 13 props, `VisitaCard` com 8).
4. **Estados que mudam juntos** dispersos em variáveis paralelas (dialogs de agendamento, justificativa, ticket).
5. **AuthContext** com um `tokenVersion` artificial e um `getToken` memoizado que não trazem valor real.

A correção principal não é "trocar tudo por Redux" — é **separar estado de servidor (TanStack Query) de estado de UI (useState/useReducer locais)**, e **consolidar dialogs com objeto de estado único ou pequenos componentes self-contained**.

---

## 1. Prop drilling — onde dói

### 1.1 `JobCard` recebe 13 props (Jobs.jsx:172)

```jsx
const JobCard = React.memo(({
  job, onNavigate, onFinalize, onSchedule, onJustify, onArchive, onOpenTicket,
  isAdmin, isManager, isLoading, selectionMode, isSelected, onToggleSelect
}) => { ... });
```

**Diagnóstico.** O componente recebe 6 callbacks de mutação, 2 flags de role e 3 flags de estado de seleção. Cada callback é fechado sobre o estado do parent (`Jobs.jsx`, 46 useStates). O `React.memo` está sendo derrotado a cada render porque as callbacks são re-criadas (em Jobs.jsx vimos `useCallback` usado em algumas, mas não em todas as 6).

**Por que é prop drilling.** Esses callbacks abrem dialogs (`setShowScheduleDialog(true); setSelectedJob(job)`), e os dialogs estão renderizados no parent — então `JobCard` é apenas um repassador. Mesma situação em `VisitaCard` (8 props).

**Recomendação.** Padrão **compound components + reducer ou objeto único de dialog**:

```jsx
// jobs/dialogs/JobDialogsProvider.jsx
const JobDialogsContext = createContext(null);

export function JobDialogsProvider({ children }) {
  const [open, setOpen] = useState({ kind: null, job: null }); // ← um objeto, não 4 booleans
  const openSchedule = useCallback((job) => setOpen({ kind: 'schedule', job }), []);
  const openJustify  = useCallback((job) => setOpen({ kind: 'justify',  job }), []);
  const openTicket   = useCallback((job) => setOpen({ kind: 'ticket',   job }), []);
  const openArchive  = useCallback((job) => setOpen({ kind: 'archive',  job }), []);
  const close = useCallback(() => setOpen({ kind: null, job: null }), []);
  const value = useMemo(() => ({ open, openSchedule, openJustify, openTicket, openArchive, close }), [open, openSchedule, openJustify, openTicket, openArchive, close]);
  return (
    <JobDialogsContext.Provider value={value}>
      {children}
      <ScheduleDialog />
      <JustifyDialog />
      <TicketDialog />
      <ArchiveDialog />
    </JobDialogsContext.Provider>
  );
}
export const useJobDialogs = () => useContext(JobDialogsContext);
```

Aí `JobCard` cai para 3 props (`job`, `selectionMode`, `isSelected`) e usa `useJobDialogs()` por dentro. Os dialogs são lazy-mounted e o contexto vive só na rota `/jobs`.

### 1.2 `Sidebar` lê `isAdmin/isManager/isInstaller` via context — OK

Esse uso está correto: dados realmente globais (role), consumidos por múltiplos sub-trees (Sidebar, BottomNav, ProtectedRoute). Não é prop drilling — é exatamente para isso que o Context API existe.

### 1.3 Repasse silencioso de `user.role` em pages

`Sidebar.jsx:163` calcula manualmente `user?.role === 'admin' ? 'Administrador' : user?.role === 'manager' ? 'Gerente' : 'Instalador'`. Esse switch aparece em pelo menos 6 lugares. Trivial, mas **espalhar regra de negócio (label do role)** convida a divergência. Mover para `AuthContext` como `roleLabel` derivado.

---

## 2. Estado no nível errado — promover ou rebaixar

### 2.1 Estado de servidor está rebaixado (deveria ser global, mas é por componente)

**Sintoma.** `useJobs.js` mantém `jobs`, `installers`, `loading`, `error`, `syncing`, `actionLoading` em useState locais — porém é instanciado **dentro de `Jobs.jsx`**. Quando o usuário navega para `/calendar`, `/dashboard` ou `/jobs/:id`, cada uma chama `api.getJobs()` de novo (Calendar.jsx tem 30 useStates próprios e refaz o fetch).

**Por que é problema.**
- Round-trip duplicado em todas as transições.
- Inconsistência: `Jobs.jsx` agenda um job e atualiza só seu `setJobs(prev=>...)` local; se o usuário vai pro `/calendar` antes do TTL do cache do api.js expirar, vê dados desatualizados.
- Optimistic updates manuais (`setJobs(prev => prev.map(...))`) replicados em `useJobs.updateJob`, `useJobs.scheduleJob`, `useJobs.finalizeJob`, `useJobs.archiveJob` — quatro implementações do mesmo padrão.

**Recomendação.** Servidor → **TanStack Query**:

```jsx
// hooks/queries/jobs.js
const jobsKey = (filters) => ['jobs', filters];
export const useJobsQuery = (filters) => useQuery({
  queryKey: jobsKey(filters),
  queryFn: () => api.getJobs(filters).then(r => r.data),
  staleTime: 30_000,
});

export const useScheduleJob = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, ...payload }) => api.updateJob(jobId, payload),
    onMutate: async ({ jobId, ...payload }) => {
      await qc.cancelQueries({ queryKey: ['jobs'] });
      const prev = qc.getQueriesData({ queryKey: ['jobs'] });
      qc.setQueriesData({ queryKey: ['jobs'] }, (old) =>
        old?.map(j => j.id === jobId ? { ...j, ...payload } : j));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx.prev?.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
};
```

**Por quê TanStack e não outro Context?**
- Dedup automática de requests (2 hooks pedem `/jobs` em paralelo → 1 request).
- Cache invalidation declarativa (`invalidateQueries(['jobs'])`).
- `staleTime` + `refetchOnWindowFocus` resolvem o "ver dados antigos ao trocar de aba" gratuitamente.
- Cache offline-first sob `persister` (relevante para instalador em 3G).
- Substitui as 4 implementações manuais de optimistic update por um padrão único.

**Não é necessário substituir o `useApiCall`** — mantenha-o para fluxos genéricos onde TanStack seria over-engineering (ex: `/auth/me` que já roda no Context).

### 2.2 Estado de UI promovido demais

**Sintoma.** Em `InstallerJobDetail.jsx`:

```jsx
const [gpsConfirmOpen, setGpsConfirmOpen] = useState(false);
const [gpsConfirmMessage, setGpsConfirmMessage] = useState('');
const [gpsConfirmResolve, setGpsConfirmResolve] = useState(null);
```

`gpsConfirmResolve` armazena uma **função `resolve` de Promise dentro do state**, com um workaround `setGpsConfirmResolve(() => resolve)` para evitar que o React execute a função como updater. Anti-pattern documentado em React docs.

**Recomendação.** Rebaixar para um **hook isolado** que devolve o dialog como JSX e a função imperativa:

```jsx
// hooks/useConfirmDialog.js
export function useConfirmDialog() {
  const [state, setState] = useState({ open: false, message: '', resolve: null });
  const confirm = useCallback((message) => new Promise(resolve => {
    setState({ open: true, message, resolve });
  }), []);
  const onAnswer = (yes) => {
    state.resolve?.(yes);
    setState({ open: false, message: '', resolve: null });
  };
  const Dialog = useMemo(() => (
    <ConfirmDialog open={state.open} message={state.message}
      onConfirm={() => onAnswer(true)} onCancel={() => onAnswer(false)} />
  ), [state.open, state.message]);
  return { confirm, Dialog };
}

// Uso em InstallerJobDetail:
const { confirm: confirmGps, Dialog: GpsDialog } = useConfirmDialog();
// ...
const proceed = await confirmGps('GPS impreciso. Continuar?');
// no JSX:
{GpsDialog}
```

Reduz 3 useStates para 1, encapsula o workaround do "função no state", e o pattern fica reutilizável para o futuro modal de cancelamento, arquivamento, etc.

---

## 3. Estados duplicados causando inconsistência

### 3.1 `jobs` em 3 lugares simultaneamente

| Local | Conteúdo | Origem |
|---|---|---|
| `Jobs.jsx::jobs` | jobs do mês filtrado | `api.getJobs()` direto |
| `Calendar.jsx::jobs` | jobs agendados | `api.getJobs()` direto |
| `Dashboard.jsx::jobs` (via `useApiCall`) | jobs recentes | `api.getJobs()` via hook |
| Cache interno em `utils/api.js` | mesmo payload | ~30s TTL |

Quatro fontes da mesma verdade. Quando o usuário agenda um job em `Jobs.jsx`, apenas `Jobs.jsx::jobs` é atualizado. As outras três só sincronizam após reload ou expiração do cache do api.js. **TanStack Query unifica isso em uma `queryKey` única.**

### 3.2 `installers` em 4 lugares

- `useJobs.js::installers`
- `Jobs.jsx::installers` (ignora o useJobs e refaz fetch)
- `Calendar.jsx` (próprio fetch)
- `useCatalogos.js::instaladoresVC` (lista de instaladores via Visual Connect, fonte diferente!)

A 4ª é estruturalmente diferente (vem do Visual Connect) — mas as 3 primeiras são a mesma lista batendo no mesmo endpoint.

### 3.3 `user.role` derivado em três formas

| Forma | Local |
|---|---|
| `isAdmin`, `isManager`, `isInstaller` | AuthContext |
| `user?.role === 'admin'` comparação direta | 18 lugares |
| Label legível ("Administrador"/"Gerente"/"Instalador") | Sidebar:163, e duplicado |

Não é bug crítico, mas qualquer adição de role (ex: "supervisor") vai exigir caçar todas as três formas.

---

## 4. Context API mal-utilizado ou ausente

### 4.1 `AuthContext` — anti-pattern `tokenVersion`

```jsx
// AuthContext.jsx:36
const [tokenVersion, setTokenVersion] = useState(0); // Force re-render when token changes
// ...
const getToken = useCallback(() => tokenManager.getToken(), [tokenVersion]);
const token = useMemo(() => tokenManager.getToken(), [tokenVersion]);
```

**Diagnóstico.** Esse `tokenVersion` é uma "dummy state" usada apenas para invalidar o `useMemo` e o `useCallback` quando `login()` ou `logout()` são chamados. Mas como `token` e `getToken` lêem `tokenManager.getToken()` (síncrono, sem cache próprio), **a memoização não traz benefício** — está economizando um `getItem` do localStorage, que custa microssegundos.

**Custo do anti-pattern.**
- Cada `login`/`logout` re-render todos os consumidores do contexto (a árvore inteira), mesmo os que não usam `token`.
- O `useMemo` e `useCallback` aqui são **ruído** — fazem o leitor pensar que há otimização onde não há.
- Misturar "snapshot em sessionStorage" + "tokenVersion em state" + "localStorage" cria 3 fontes de verdade para a sessão.

**Recomendação.**

```jsx
// AuthContext.jsx — versão enxuta
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readSessionSnapshot());
  const [loading, setLoading] = useState(() => !readSessionSnapshot());

  // ... loadUser, evento auth:expired iguais ao atual ...

  const login = async (email, password) => { /* ... */ };
  const logout = () => { /* ... */ };

  // ❌ Remover tokenVersion, getToken e token memoizado.
  // Quem precisar do token chama tokenManager.getToken() direto (não-React).
  // ✅ Adicionar roleLabel derivado.
  const roleLabel = useMemo(() => ({
    admin: 'Administrador', manager: 'Gerente', installer: 'Instalador'
  }[user?.role] ?? 'Usuário'), [user?.role]);

  const value = useMemo(() => ({
    user, loading, login, logout, roleLabel,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    isInstaller: user?.role === 'installer',
  }), [user, loading, roleLabel]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

`useMemo` no `value` evita re-render dos consumidores quando `loading` muda mas `user` continua igual.

### 4.2 Contexts ausentes — candidatos legítimos

**`JobDialogsContext`** (já mostrado em §1.1) — escopo da rota `/jobs`. Não global. Provider renderizado dentro de `<Jobs>`, não em App.

**`CatalogosContext`** — `useCatalogos` carrega vendedores, tipos de serviço, ferramentas, colaboradores VC. Dados pequenos, semi-estáticos. Hoje cada componente que precisa dispara o fetch de novo. Se usar TanStack Query, vira `useCatalogosQuery` e o problema some sem precisar de Context. **Recomendação: TanStack Query, não Context** — porque ainda precisamos de revalidation/invalidation quando o admin cria um novo vendedor.

**`InstallerJobMachineContext`** — ver §5.

### 4.3 Contexts internos do shadcn/radix — OK

`CarouselContext`, `ToggleGroupContext`, `FormFieldContext`, `FormItemContext` são internos de `@/components/ui/*` (compostos). Uso correto: escopo do componente, dados implícitos compartilhados entre sub-partes. Não mexer.

---

## 5. Estados que mudam juntos — agrupar

### 5.1 Dialogs em Jobs.jsx (4 grupos)

| Grupo | useStates dispersos | Proposta |
|---|---|---|
| Schedule individual | `showScheduleDialog`, `selectedJob`, `scheduleDate`, `scheduleTime`, `scheduleInstallerIds` | `useState({ kind: 'schedule', job, date, time, installers })` ou `useReducer` |
| Justify | `showJustifyDialog`, `justifyJob`, `justifyReason`, `justifyType`, `sendingJustification` | idem |
| Ticket CS | 10 useStates (`showTicketDialog` → `sendingTicket`) | `useReducer` com actions `OPEN`, `SET_FIELD`, `SUBMIT_START`, `SUBMIT_DONE` |
| Batch schedule | `showBatchScheduleDialog`, `batchScheduleDate`, `batchScheduleInstallerIds`, `batchScheduling` | idem |

**Razão para agrupar.** Cada um desses grupos **vive e morre junto**: ao fechar o dialog, todos os campos voltam ao default. Hoje, fechar exige `setShowX(false); setXJob(null); setXReason('')` em 3-4 linhas — propenso a esquecer um e mostrar estado stale ao reabrir.

```jsx
// reducer para o ticket dialog
const initialTicket = {
  open: false, job: null, categoria: 'Instalação', prioridade: 'Média',
  descricao: '', responsavel: '', sending: false,
};
function ticketReducer(state, action) {
  switch (action.type) {
    case 'OPEN':       return { ...initialTicket, open: true, job: action.job };
    case 'SET_FIELD':  return { ...state, [action.field]: action.value };
    case 'SUBMIT_START': return { ...state, sending: true };
    case 'SUBMIT_DONE':  return initialTicket; // fecha e limpa
    default: return state;
  }
}
// ... const [ticket, dispatchTicket] = useReducer(ticketReducer, initialTicket);
```

### 5.2 GPS machine em InstallerJobDetail (7 useStates relacionados)

```jsx
const [gpsLocation, setGpsLocation] = useState(null);
const [gpsError, setGpsError] = useState(null);
const [gpsConfirmOpen, setGpsConfirmOpen] = useState(false);
const [gpsConfirmMessage, setGpsConfirmMessage] = useState('');
const [gpsConfirmResolve, setGpsConfirmResolve] = useState(null);
const [locationPermissionGuideOpen, setLocationPermissionGuideOpen] = useState(false);
const [pendingGpsRetry, setPendingGpsRetry] = useState(null);
```

São 7 useStates que representam **uma única máquina de estados**: `idle → requesting → low-accuracy-confirm → permission-denied → retry-pending → success`. Cada transição mexe em 2-4 desses estados. Erro propenso a deixar `gpsConfirmOpen=true` com `gpsConfirmResolve=null` (que aconteceria se um update parcial falhasse).

**Recomendação.** Hook `useGpsMachine`:

```jsx
function useGpsMachine() {
  const [state, dispatch] = useReducer(gpsReducer, { phase: 'idle' });
  const requestGPS = useCallback(async () => { /* lê state.phase e despacha */ }, []);
  return { phase: state.phase, location: state.location, error: state.error, requestGPS, ... };
}
```

Bonus: o hook fica testável isoladamente (Jest puro, sem React Testing Library).

### 5.3 Estado morto (gamification disabled)

```jsx
// InstallerJobDetail.jsx:71-72
const [showCoinAnimation, setShowCoinAnimation] = useState(false);
const [earnedCoins, setEarnedCoins] = useState(0);
```

CLAUDE.md menciona `[GAMIFICATION DISABLED 2026-05-15]` em 4 comentários. Esses 2 useStates **nunca são acionados** (apenas o handler de animação `handleCoinAnimationComplete` permanece, mas nada chama). **Remover.** Mesmo case em `GamificationWidget.jsx`, `GamificationHighlight.jsx`, `WeeklyLeaderboard.jsx`.

---

## 6. `useApiCall` foi escrito mas não adotado

O grep mostra que `useApiCall` aparece em:
- `hooks/useApiCall.js` (definição)
- `hooks/README.md` (documentação)
- `pages/Dashboard.jsx` (único consumidor real)

Enquanto isso, 23 pages continuam fazendo `useState + useEffect + try/catch + setLoading(false)` manualmente. Dois caminhos possíveis:

**A. Caminho conservador (1 sprint):** migrar as 23 pages para `useApiCall` mecanicamente. Reduz boilerplate, mas não resolve duplicação de cache entre pages.

**B. Caminho radical (2-3 sprints, recomendado):** introduzir TanStack Query como camada de servidor para pages "lista + mutação", e usar `useApiCall` apenas para fluxos one-shot (login, password reset, ad-hoc admin operations). Aposentar `useJobs.js` (que reimplementa metade do TanStack à mão). Hooks de domínio passam a ser camada fina sobre `useQuery` / `useMutation`.

---

## 7. Arquitetura-alvo

```
┌────────────────────────────────────────────────────────────────────────┐
│  App                                                                   │
│  ├── BrowserRouter                                                     │
│  ├── QueryClientProvider (TanStack — staleTime 30s, persister offline) │
│  ├── AuthProvider (user + role + login/logout — sem tokenVersion)      │
│  ├── ErrorBoundary                                                     │
│  └── AppRoutes                                                         │
│      ├── /jobs                                                         │
│      │   └── JobDialogsProvider (escopo da rota)                       │
│      │       ├── <JobsList />  ← consome useJobsQuery                  │
│      │       └── <ScheduleDialog />, <TicketDialog />, ...             │
│      ├── /installer/job/:id                                            │
│      │   └── <InstallerJobDetail />                                    │
│      │       ├── useJobQuery(id)         ← server state                │
│      │       ├── useItemCheckinsQuery(id)                              │
│      │       ├── useGpsMachine()         ← UI state (reducer)          │
│      │       ├── useConfirmDialog()                                    │
│      │       └── usePauseDialog()                                      │
│      └── ...                                                           │
└────────────────────────────────────────────────────────────────────────┘
```

**Estado de servidor:** TanStack Query — cache global, dedup, optimistic updates declarativos.
**Estado de UI global:** AuthContext (user + roleLabel + flags).
**Estado de UI escopo-rota:** Provider local (JobDialogsProvider) onde fizer sentido.
**Estado de UI local:** useState/useReducer dentro do componente. Para 3+ campos correlatos, useReducer.

**Não recomendo Zustand/Redux/Jotai neste projeto.** A complexidade que justifica essas libs (estado global cross-feature, time-travel debugging, middlewares) não está presente. TanStack + Context cobrem 95% dos casos com menos peso.

---

## 8. Plano de refatoração priorizado

| # | Severidade | Esforço | Item |
|---|---|---|---|
| R1 | P1 | 0.5 d | **Remover gamification dead state** em InstallerJobDetail e nos 3 componentes Gamification* |
| R2 | P1 | 0.5 d | **Limpar `tokenVersion` do AuthContext** + memoizar `value` |
| R3 | P1 | 1 d | **Extrair `useConfirmDialog`** e migrar o GPS confirm |
| R4 | P1 | 1 d | **Extrair `useGpsMachine`** (reducer) e remover os 7 useStates do GPS |
| R5 | P1 | 1 d | **Agrupar dialogs do Jobs.jsx em useReducer** (4 grupos) |
| R6 | P0 | 2 d | **Instalar TanStack Query** + migrar `useJobs` → `useJobsQuery` + `useScheduleJob` mutation |
| R7 | P1 | 1 d | Migrar `Jobs.jsx`, `Calendar.jsx`, `Dashboard.jsx` para `useJobsQuery` (elimina 3 fontes de verdade) |
| R8 | P1 | 1.5 d | Migrar `useCatalogos` → 4 `useQuery` independentes; remover Map duplicado em useState |
| R9 | P1 | 1.5 d | `InstallerJobDetail` → `useJobQuery(id)` + `useItemCheckinsQuery(id)` + invalidate após mutation |
| R10 | P2 | 1 d | Extrair `JobDialogsProvider` + reduzir `JobCard` para 3 props |
| R11 | P2 | 0.5 d | Adicionar `roleLabel` ao AuthContext; remover switches duplicados em Sidebar/BottomNav |
| R12 | P2 | 2 d | Migrar as 18 pages restantes para `useApiCall` ou `useQuery` (mecânico) |
| R13 | P2 | 0.5 d | Aposentar `useJobs.js` quando R6+R7 estiverem em produção |

**Total:** ~13 dias de engenharia — pode ser feito em 3 sprints sem bloquear novas features.

---

## 9. Riscos e mitigação

- **Risco:** introduzir TanStack Query em paralelo às chamadas axios diretas pode causar 2 cargas iniciais até a migração ficar pronta. **Mitigação:** migrar uma rota de cada vez; após /jobs estável, mover /calendar e /dashboard.
- **Risco:** mudanças no AuthContext quebram tokenManager. **Mitigação:** o tokenManager continua sendo a source-of-truth do token; o contexto apenas para de memoizá-lo, mantendo todos os consumidores que chamam `tokenManager.getToken()` diretamente.
- **Risco:** desenvolvedores podem misturar `useQuery` com `useApiCall` na mesma página. **Mitigação:** adicionar regra ESLint `no-mixed-data-fetching` ou pelo menos um lint comment no README dos hooks, e fazer code review obrigatório nas PRs de migração.

---

## Anexo A — Métricas extraídas via grep

```
useState( em frontend/src                        → 346 ocorrências, 48 arquivos
api importado em frontend/src/pages              → 23 arquivos
useApiCall importado/usado                       → 1 página real (Dashboard.jsx)
const [error, setError] = useState               → 32 arquivos
const [loading, setLoading] = useState           → 25 arquivos
createContext (próprio, fora de shadcn/ui)       → 1 (AuthContext)
useState em pages com nome do hook na list:
  Jobs.jsx                                       → 46 useStates
  Calendar.jsx                                   → 30 useStates
  UnifiedReports.jsx                             → 27 useStates
  InstallerJobDetail.jsx                         → 19 useStates
  JobDetail.jsx                                  → 31 useStates
  VisitasTecnicas.jsx                            → 11 useStates (mas o page todo > 1000 LOC)
React.memo com >5 props (prop drilling)          → JobCard (13), VisitaCard (8)
```
