# `src/hooks/`

Custom React hooks for the frontend. All hooks here are JavaScript (no TS),
written for React 19 with `react-hooks/exhaustive-deps` enabled (see
`frontend/eslint.config.js`).

## TL;DR

If you find yourself writing this in a page component:

```jsx
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  loadData();
}, []);

const loadData = async () => {
  setLoading(true);
  try {
    const res = await api.getX();
    setData(res.data || []);
  } catch (e) {
    console.error(e);
    toast.error('Erro ao carregar X');
  } finally {
    setLoading(false);
  }
};
```

…stop. Use `useApiCall` instead:

```jsx
import { useApiCall } from '@/hooks';

const { data, loading, refresh } = useApiCall(api.getX, {
  defaultData: [],
  errorMessage: 'Erro ao carregar X',
});
```

That's the whole hook in one line. Cancellation, loading state, and toast are
handled. See `useApiCall.js` for the full API and more examples.

## Inventory

| Hook                    | Purpose                                                  |
|-------------------------|----------------------------------------------------------|
| `useApiCall`            | Generic fetch + loading/error/cancel. Use for any GET.   |
| `useJobs`               | Domain hook for the Jobs page — list + mutations.        |
| `useReschedule`         | Reschedule a single job. Returns `{ reschedule, loading }`. |
| `useCatalogos`          | Loads vendedores/tipos/ferramentas/colaboradores VC.     |
| `usePushNotifications`  | Web Push subscribe/unsubscribe + permission state.       |
| `useVisitas`            | List visitas técnicas with filters.                      |
| `useVisitasReports`     | The 4 visita reports (instalador / vendedor / etc).      |

## Conventions

### 1. Always include cancellation guard

Every async effect must guard `setState` calls against the consumer
unmounting. The pattern:

```js
const cancelledRef = useRef(false);

useEffect(() => {
  cancelledRef.current = false;
  apiFn().then(r => {
    if (!cancelledRef.current) setData(r.data);
  });
  return () => { cancelledRef.current = true; };
}, [/* deps */]);
```

`useApiCall` does this for you; if you can use it, do.

### 2. Stable callbacks via `useCallback` with explicit deps

If a function is referenced inside `useEffect`, wrap it in `useCallback` and
list it as a dependency:

```js
const loadData = useCallback(async () => {
  // uses `id`, `userRole`
}, [id, userRole]);

useEffect(() => {
  loadData();
}, [loadData]);
```

Don't suppress `react-hooks/exhaustive-deps`. If you genuinely need a
"run once on mount" effect, extract the body into a function first and
review whether all its referenced state is truly stable.

### 3. Naming

- `fetchX` — does the network call, returns the result
- `loadX` — calls fetchX and writes to state (now mostly replaced by useApiCall)
- `mutateX`, `updateX`, `archiveX` — write operations

### 4. Error handling

- Errors that the user must see → `toast.error(...)`
- Errors that are diagnostic only → `console.error(...)` with a clear prefix
- Never silently swallow with `catch (_) {}` — at minimum, log

### 5. Hook composition

Domain hooks (`useJobs`, `useVisitas`, `useReschedule`) should compose on
top of `useApiCall` rather than duplicating its boilerplate. As old hooks
are touched, migrate them.

## Anti-patterns to avoid

❌ `useEffect(() => loadX(), [])` with `loadX` declared inline below — the
useEffect captures the first-render version.

❌ `const [data, setData] = useState({})` then mutating with `data.foo = bar`
— React won't see the change.

❌ `useState(new Set())` updated with `set.add()` directly — same problem;
must do `setSet(new Set(prev).add(x))`.

❌ Calling `useApiCall` conditionally (`if (admin) useApiCall(...)`) — Rules
of Hooks violation. Pass `immediate: admin` instead.

❌ Putting an arrow function in `apiFn` that captures changing state without
listing those values in `deps`:

```js
// ❌ BAD — `branch` change won't re-fetch
useApiCall(() => api.getJobs({ branch }), { defaultData: [] });

// ✅ GOOD — declared in deps
useApiCall(() => api.getJobs({ branch }), { deps: [branch], defaultData: [] });
```

## Adding a new hook

1. Create `useFoo.js` in this folder.
2. Add a named export.
3. Re-export it from `index.js` so consumers do `import { useFoo } from '@/hooks'`.
4. If it's a fetch + state hook, build it on top of `useApiCall`.
5. Document any non-obvious behavior at the top of the file.
