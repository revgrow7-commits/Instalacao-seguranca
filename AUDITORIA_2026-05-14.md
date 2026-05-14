# Auditoria Pré-Produção — Indústria Visual

**Data:** 2026-05-14
**Escopo auditado:** módulos de agendamento (Calendar, InstallerCalendar, SchedulerAdmin, backend/routes/calendar.py), check-in/check-out de campo (InstallerJobDetail, Checkins, backend/routes/item_checkins.py, backend/routes/checkins.py, backend/services/gps.py) e módulo/perfil do instalador (InstallerDashboard, Profile, backend/routes/installers.py)
**Stack detectado:** React 18 (CRA, JavaScript puro — sem TypeScript) + Axios + FastAPI 3.x + Supabase PostgREST (com wrapper MongoDB-like) + Vercel serverless

---

## Resumo executivo

- 🔴 Bloqueadores de produção: **5**
- 🟡 Deve corrigir antes do deploy: **9**
- 🟢 Melhorias recomendadas: **6**

O projeto NÃO está pronto para produção no estado atual. Existem cinco bugs funcionais bloqueantes que afetam diretamente os módulos auditados:

1. Itens arquivados causam check-in no item errado (índice dessincronizado entre frontend e backend);
2. Os motivos de pausa do frontend não batem com os do backend — relatórios de pausa exibem labels quebradas;
3. A gamificação de checkout está totalmente desconectada (animação esperada nunca dispara, instaladores não ganham moedas);
4. `setInstallers(undefined)` em Calendar pode quebrar a tela do gerente quando o role não é admin;
5. CORS configurado como wildcard `*` em produção (já documentado no ARCH-004, mas relevante para esses módulos por permitir CSRF cross-origin nos endpoints de scheduling).

O caminho mais curto para deploy seguro é aplicar as 5 correções 🔴, mais 4 das 🟡 (race conditions em useEffect, await faltante, N+1 em pause logs, fallback de tela vazia em modo offline). Estimativa: 4–6 horas de implementação + 1h de teste manual.

---

## 🔴 Bloqueadores de produção

### B1. Índice de item dessincronizado quando job tem itens arquivados

**Onde:** `frontend/src/pages/InstallerJobDetail.jsx:584, 727, 758, 818` e `backend/routes/item_checkins.py:274–277, 574`

**Problema:** O frontend filtra itens arquivados em `getProducts()` (linha 505) mas, no `map` que renderiza a lista (linha 584), usa `index` do array filtrado como chave para chamar `handleFileSelect(index, 'checkin')`, `getItemAssignment(index)` e `handleFileSelect(index, 'checkout')`. O `index` filtrado é então enviado ao backend, que faz `products[item_index]` no array original `products_with_area` (linhas 274–277). Resultado: se um item antes do clicado foi arquivado, o backend grava check-in/checkout em outro item.

Já existe a propriedade `originalIndex` anexada (linha 479), mas ela não é usada nos handlers.

**Por que bloqueia:** Corrompe dados operacionais — m² instalado, foto, GPS e moedas vão para o item errado. Não há sinal nem para usuário nem para suporte; só aparece quando alguém audita.

```jsx
// Atual (InstallerJobDetail.jsx)
products.map((item, index) => {
  // ...
  onClick={() => handleFileSelect(index, 'checkin')}   // index do array filtrado
  const assignment = getItemAssignment(index);          // busca por index errado
  onClick={() => handleFileSelect(index, 'checkout')}
})
```

**Correção sugerida:**

```jsx
products.map((item, index) => {
  const itemIndex = item.originalIndex ?? index; // FALLBACK seguro
  // ...
  onClick={() => handleFileSelect(itemIndex, 'checkin')}
  const assignment = getItemAssignment(itemIndex);
  onClick={() => handleFileSelect(itemIndex, 'checkout')}
})
```

Também adicionar defesa no backend (`item_checkins.py:274`) para rejeitar `item_index` cujo item esteja em `job.archived_items`:

```python
archived_indices = {a.get("item_index") for a in job.get("archived_items", [])}
if item_index in archived_indices:
    raise HTTPException(status_code=400, detail="Item arquivado — check-in não permitido")
```

---

### B2. PAUSE_REASONS divergentes entre frontend e backend

**Onde:** `frontend/src/pages/InstallerJobDetail.jsx:22–31` vs `backend/routes/item_checkins.py:24–42`

**Problema:** O frontend grava 8 motivos de pausa com chaves como `aguardando_cliente`, `chuva`, `falta_material`, `almoco_intervalo`, `problema_acesso`, `problema_equipamento`, `aguardando_aprovacao`, `outro`. O backend mantém um dicionário totalmente diferente: `almoço`, `banheiro`, `esperando_material`, `problema_tecnico`, `atendimento_cliente`, `deslocamento`, `outro`. **Só "outro" coincide.**

O backend não valida o `reason` (aceita qualquer string em `Form(...)`), então a pausa é gravada com a chave do front, mas o relatório que lê `PAUSE_REASON_LABELS` no backend (linha 793, `get_item_pause_logs`) devolve a própria chave porque não encontra label — tela do gerente exibe `"chuva"` em vez de `"Chuva/Intempérie"`.

**Por que bloqueia:** Quebra o relatório de pausas (Checkins.jsx e VisitasRelatorios). Decisão gerencial baseada em causa-raiz fica inviável — os instaladores estão registrando motivos que ninguém consegue ler de forma legível na admin.

**Correção sugerida:** Eleger o conjunto canônico (sugiro o do frontend, que é mais descritivo e operacionalmente útil) e sincronizar. Mover para um único local fonte da verdade — recomendo `backend/config.py` exportando `PAUSE_REASONS` e o frontend consumir via `api.getPauseReasons()` no carregamento (rota já existe em `api.js:279`).

Patch mínimo aplicável já (sincronizar backend ao frontend):

```python
# backend/routes/item_checkins.py
PAUSE_REASONS = [
    "aguardando_cliente", "chuva", "falta_material", "almoco_intervalo",
    "problema_acesso", "problema_equipamento", "aguardando_aprovacao", "outro",
]

PAUSE_REASON_LABELS = {
    "aguardando_cliente": "Aguardando Cliente",
    "chuva": "Chuva/Intempérie",
    "falta_material": "Falta de Material",
    "almoco_intervalo": "Almoço/Intervalo",
    "problema_acesso": "Problema de Acesso",
    "problema_equipamento": "Problema com Equipamento",
    "aguardando_aprovacao": "Aguardando Aprovação",
    "outro": "Outro Motivo",
}
```

E validar no endpoint de pause:

```python
if reason not in PAUSE_REASONS:
    raise HTTPException(status_code=400, detail=f"Motivo inválido. Use um de: {PAUSE_REASONS}")
```

---

### B3. Gamificação de checkout está desconectada (animação dead code)

**Onde:** `frontend/src/pages/InstallerJobDetail.jsx:321–327` e `backend/routes/item_checkins.py:410–634`

**Problema:** Em `handleItemCheckout`, o frontend espera `response.data?.gamification?.coins_awarded` no retorno de `api.completeItemCheckout(...)`. Mas o backend `complete_item_checkout` (linha 410) **não calcula nem retorna `gamification`** — só devolve o checkin atualizado. As funções `calculate_checkout_coins` e `award_coins` em `item_checkins.py:167–174` são placeholders que retornam `{"total_coins": 0}`/`None`.

A rota correta de gamificação `/gamification/process-checkout/{checkin_id}` existe em `gamification.py:339`, e a função frontend `api.processCheckoutGamification` existe em `api.js:383` — mas **nada no frontend chama essa função após o checkout**. Confirmado via grep: zero referências fora da declaração.

Resultado: a animação de moedas (CoinAnimation, linhas 53/322 do InstallerJobDetail) nunca dispara. Toast.success "Check-out do item realizado!" sempre cai no `else` da linha 325. Instaladores não ganham moedas por completar item.

**Por que bloqueia:** A gamificação é uma feature visível com fluxo de UX completo (animação, balance no header, loja `LojaFaixaPreta`). Está promessa quebrada — instalador vê a recompensa anunciada (linha 933 do JobDetail diz "tempo pausado será excluído ... garantindo que sua métrica seja justa") mas nunca recebe. Pior: incentiva fraude, porque um instalador esperto vai descobrir que daily_engagement é a única fonte real de moedas.

**Correção sugerida:** Encadear a chamada de gamificação após o checkout no frontend (ou melhor: chamar do backend dentro do `complete_item_checkout`, evitando race).

Patch frontend (mínimo, baixo risco):

```jsx
// InstallerJobDetail.jsx, handleItemCheckout
const response = await api.completeItemCheckout(checkin.id, formData);

// NOVO — dispara gamificação após checkout
let coinsAwarded = 0;
try {
  const gamiRes = await api.processCheckoutGamification(checkin.id);
  coinsAwarded = gamiRes.data?.coins_awarded || 0;
} catch (e) {
  console.warn('Gamification failed (non-blocking):', e);
}

if (response.data?.location_alert) { /* ... */ }

if (coinsAwarded > 0) {
  setEarnedCoins(coinsAwarded);
  setShowCoinAnimation(true);
} else {
  toast.success('Check-out do item realizado!');
}
```

Patch backend longo prazo (recomendado): chamar `process_checkout_gamification` internamente em `complete_item_checkout` em background-task, retornando `gamification: {coins_awarded: N}` na resposta. Elimina round-trip extra e evita race condition (instalador fecha o app antes da segunda chamada).

---

### B4. `setInstallers(installersRes.data)` sem fallback — Calendar pode quebrar

**Onde:** `frontend/src/pages/Calendar.jsx:142`

**Problema:** Em `loadData`, quando o usuário não é admin nem manager (caso `isInstaller` na linha 107), `installersRes` é `{ data: [] }` por causa do `Promise.resolve({ data: [] })`. Mas a chamada real `api.getInstallers()` usa `getCachedOrFetch` (api.js:118) que retorna o objeto Axios completo — se houver falha de rede, `installersRes.data` pode ser `undefined`. Mais grave: se um manager autenticado tem o token expirado, o interceptor redireciona, mas brevemente `installersRes` pode vir sem `data`. Resultado: `installers.map(inst => ...)` e `installers.findIndex(...)` na linha 435 quebram com `TypeError: Cannot read properties of undefined`.

**Por que bloqueia:** Tela branca para o gerente sem nenhuma mensagem, em meio ao fluxo crítico de agendamento. Não há Error Boundary que segure.

**Correção sugerida:**

```jsx
// Calendar.jsx:142
setInstallers(installersRes.data || []);
```

Também aplicar em `InstallerDashboard.jsx:152`:

```jsx
setRecentTransactions(transactionsRes.data || []);
```

E adicionar um `ErrorBoundary` em `App.js` em volta das rotas críticas (vou aplicar como parte de R1).

---

### B5. CORS wildcard `*` permitido por padrão (já documentado em ARCH-004)

**Onde:** `backend/server.py` (CORS middleware) — não está no arquivo lido nesta auditoria, mas marcado em `CLAUDE.md`.

**Problema:** Endpoints de scheduling (`/jobs/{id}/schedule`, `/calendar/events`, `/scheduler/jobs/{id}/run-now`) aceitam requisições de qualquer origem, com cookies/JWT. Em um cenário onde um instalador tem sessão ativa em `instal-visual.com.br` e clica num link malicioso, é possível disparar reagendamento ou execução manual da sincronização via CSRF.

**Por que bloqueia:** Particularmente crítico nos endpoints auditados:
- `/scheduler/jobs/.../run-now` consome rate limit da Holdprint API
- `/jobs/.../schedule` modifica agendamento de outros instaladores
- `/auth/google/disconnect` (calendar.py:253) desconecta Google Calendar do usuário

**Correção sugerida:** Configurar a env `CORS_ORIGINS` no Vercel para `https://instal-visual.com.br,https://www.instal-visual.com.br`. Já está documentado, falta executar.

---

## 🟡 Deve corrigir antes do deploy

### M1. N+1 problem em `loadJobData` (InstallerJobDetail)

**Onde:** `frontend/src/pages/InstallerJobDetail.jsx:114–153`

**Problema:** Para cada checkin in_progress/paused, faz uma chamada sequencial `await api.getItemPauseLogs(c.id)`. Com 8 itens em paralelo, são 8 round-trips em série na tela mais aberta pelos instaladores em campo (3G ruim).

**Correção sugerida:** Trocar o for por `Promise.all`:

```jsx
const activeCheckins = checkinsRes.data.filter(c => c.status === 'in_progress' || c.status === 'paused');
const pauseResults = await Promise.allSettled(
  activeCheckins.map(c => api.getItemPauseLogs(c.id))
);
activeCheckins.forEach((c, i) => {
  const r = pauseResults[i];
  pauseLogsMap[c.item_index] = r.status === 'fulfilled'
    ? r.value.data
    : { pauses: [], total_pause_minutes: 0 };
});
```

---

### M2. `useEffect` sem AbortController/cleanup em Calendar, InstallerCalendar, InstallerJobDetail, InstallerDashboard

**Onde:** múltiplos arquivos — `Calendar.jsx:84`, `InstallerCalendar.jsx:21`, `InstallerJobDetail.jsx:61`, `InstallerDashboard.jsx:78`

**Problema:** Componentes carregam dados em `useEffect(() => { loadData(); }, [])` sem cancelar a Promise no unmount. Se o instalador navegar entre jobs rapidamente, `setState` é chamado em componente desmontado — gera warning e potencialmente sobrescreve estado errado. Em mobile lento isso é comum.

**Correção sugerida:** Padrão `cancelled` flag (não precisa AbortController para evitar complexidade):

```jsx
useEffect(() => {
  let cancelled = false;
  const run = async () => {
    try {
      const data = await api.getJobs();
      if (!cancelled) setJobs(data);
    } catch (e) {
      if (!cancelled) toast.error('Erro');
    }
  };
  run();
  return () => { cancelled = true; };
}, [jobId]);
```

---

### M3. `loadCheckins`, `loadVisitas`, `loadGamificationData` com catch silencioso sem log

**Onde:** `InstallerDashboard.jsx:124, 140, 153`

**Problema:** Os `catch {}` engolem o erro sem `console.error`. Quando um instalador reporta "minha agenda sumiu", não há nada nos logs para investigar.

**Correção sugerida:**

```jsx
} catch (e) {
  console.error('[InstallerDashboard] loadCheckins:', e);
  // silencioso na UI, mas logado
}
```

---

### M4. `disconnectGoogleCalendar` sem confirmação

**Onde:** `Calendar.jsx:159–168`

**Problema:** Botão "X" pequeno no card de Google Calendar executa `disconnectGoogleCalendar` direto. Clique acidental desconecta a integração e força reautorização OAuth completa. Risco elevado em telas touch.

**Correção sugerida:**

```jsx
const disconnectGoogleCalendar = async () => {
  if (!window.confirm('Desconectar o Google Calendar? Você precisará autorizar novamente para sincronizar jobs.')) return;
  try { /* ... */ }
};
```

---

### M5. `endDate` fixo em 4 horas mesmo quando job tem `scheduled_time_end`

**Onde:** `Calendar.jsx:178–179`

**Problema:** `const endDate = new Date(scheduledDate.getTime() + 4 * 60 * 60 * 1000);` ignora `job.scheduled_time_end`. Evento no Google Calendar fica sempre 4h.

**Correção sugerida:**

```jsx
const endDate = job.scheduled_time_end
  ? new Date(job.scheduled_time_end)
  : new Date(scheduledDate.getTime() + 4 * 60 * 60 * 1000);
```

---

### M6. GPS_ACCURACY_LIMIT rígido em 100m no frontend

**Onde:** `InstallerJobDetail.jsx:20, 84`

**Problema:** `if (position.coords.accuracy > GPS_ACCURACY_LIMIT)` rejeita check-in com precisão pior que 100m. Em zonas urbanas densas ou local fechado o GPS de smartphone frequentemente reporta 50–200m. Instalador trava na tela e o sistema não tem fallback.

A configuração de distância de checkout do backend (`MAX_CHECKOUT_DISTANCE_METERS = 500` em `item_checkins.py:21`) já é tolerante; o front deveria ser ao menos consistente, ou permitir override consciente do usuário.

**Correção sugerida:**

```jsx
const GPS_ACCURACY_LIMIT = 200; // metros — mais permissivo, alinha com backend

// E permitir bypass com aviso:
if (position.coords.accuracy > GPS_ACCURACY_LIMIT) {
  const proceed = window.confirm(
    `GPS impreciso (${Math.round(position.coords.accuracy)}m). Continuar mesmo assim? A localização aproximada será registrada.`
  );
  if (!proceed) {
    reject(new Error('Usuário cancelou check-in por GPS impreciso'));
    return;
  }
}
```

---

### M7. Drag-and-drop não funciona em mobile

**Onde:** `Calendar.jsx:227–264`

**Problema:** A interação principal de agendamento (arrastar job para data) usa `onDragStart`/`onDragOver`/`onDrop` HTML5, que não disparam em touch. O dialog "Agendar Job" continua acessível, mas o usuário móvel não consegue arrastar do painel lateral. A UI sugere o gesto sem habilitá-lo.

**Correção sugerida:** Para 1ª iteração rápida, esconder o painel de jobs não agendados em mobile e oferecer só o botão "Agendar" via modal. Para solução completa, adicionar suporte touch (lib `react-dnd-touch-backend` ou similar) — fora do escopo desta auditoria.

Patch mínimo:

```jsx
{(isAdmin || isManager) && allJobs.length > 0 && !isMobile && (
  <Card className="bg-card border-white/5 lg:col-span-1 h-fit">
    {/* painel de drag */}
  </Card>
)}
```

---

### M8. Schedule conflict check usa `time` mas ignora duração

**Onde:** `Calendar.jsx:266–275` e `api.checkScheduleConflicts(...)`

**Problema:** `checkConflicts(installerId, date, scheduleTime)` envia apenas hora inicial. Backend não recebe duração nem `scheduled_time_end`, então pode reportar "sem conflito" quando o job dura 4h e se sobrepõe com outro 2h depois. A lógica `hasConflict` na `InstallerDayView` (linha 1489–1504) já considera intervalos, mas o `checkConflicts` chamado no submit (linha 283) não.

**Correção sugerida:** Estender o endpoint `/notifications/check-schedule-conflicts` para receber `duration_minutes` ou `scheduled_time_end` e validar overlap real. Frontend passa estimativa de 2h se não houver `scheduled_time_end`.

---

### M9. `complete_item_checkout` aceita `item_index` de item arquivado sem validação

**Onde:** `backend/routes/item_checkins.py:410–442`

**Problema:** Não valida `archived_items` antes de atualizar `installed_products`. Mesmo após corrigir o frontend (B1), um cliente malicioso ou bug regression pode reintroduzir o problema.

**Correção sugerida:** Adicionar validação no início de `complete_item_checkout`:

```python
job = db.jobs.find_one({"id": checkin["job_id"]}, {"_id": 0})
archived_indices = {a.get("item_index") for a in (job or {}).get("archived_items", [])}
if checkin["item_index"] in archived_indices:
    raise HTTPException(status_code=400, detail="Item arquivado — checkout bloqueado")
```

---

## 🟢 Melhorias recomendadas

### R1. Adicionar Error Boundary em torno das rotas críticas

**Onde:** `frontend/src/App.js` (não lido nesta auditoria, mas referenciado em CLAUDE.md)

**Problema:** Nenhum Error Boundary visível na árvore. Qualquer erro de render em Calendar/InstallerJobDetail derruba o app inteiro para tela branca.

**Correção sugerida:** Criar `components/ErrorBoundary.jsx` clássico e envelopar `<Routes>` em App.js. Para versão moderna, considerar `react-error-boundary` (a equipe escolhe).

---

### R2. Componentes `DayDetailModal` e Job Detail Modal declarados inline em Calendar

**Onde:** `Calendar.jsx:393–549, 1117–1218`

**Problema:** `function DayDetailModal()` declarada dentro do corpo de render do componente Calendar — recria a função e seus closures a cada render. Mesmo problema para o IIFE de job detail. Causa re-renders supérfluos e impossibilita memo.

**Correção sugerida:** Extrair para arquivos separados em `frontend/src/components/calendar/` ou para o topo do arquivo, passando props.

---

### R3. Senha mínima 6 caracteres aceita no Profile, mas dicas sugerem 8

**Onde:** `frontend/src/pages/Profile.jsx:99` e `backend/routes/auth_new.py:152` (PENDING-005)

**Problema:** Inconsistência entre UI ("Dicas: pelo menos 8 caracteres") e validação real (6). Backend também aceita 6.

**Correção sugerida:** Subir mínimo para 8 caracteres com validação de complexidade básica:

```jsx
if (passwordForm.newPassword.length < 8) {
  toast.error('A nova senha deve ter pelo menos 8 caracteres');
  return;
}
if (!/[A-Z]/.test(passwordForm.newPassword) || !/[0-9]/.test(passwordForm.newPassword)) {
  toast.error('A senha deve conter letra maiúscula e número');
  return;
}
```

E sincronizar backend.

---

### R4. Magic number `4 * 60 * 60 * 1000` para "atraso"

**Onde:** `Checkins.jsx:90`

**Problema:** Constante "atrasado = mais de 4h sem checkout" hardcoded no componente. Deveria vir de config ou pelo menos ser constante nomeada `LATE_CHECKIN_HOURS = 4`.

---

### R5. `Cronometer` recria `Date` 1x/segundo

**Onde:** `Checkins.jsx:33–73`

**Problema:** A cada tick `new Date(startTime)` é instanciada. Em uma lista com 20 cronômetros, são 20 alocações por segundo. Otimização menor mas relevante para mobile fraco.

**Correção sugerida:** Memoizar `start = useMemo(() => new Date(startTime), [startTime])`.

---

### R6. Polling de SchedulerAdmin reseta `setLoading(true)` a cada tick

**Onde:** `SchedulerAdmin.jsx:29, 47`

**Problema:** O fetch a cada 30s seta `loading=true`, fazendo spinner piscar. Boa prática: usar `refreshing` state separado para refreshes em background.

---

## Plano de refatoração

Tarefas em ordem de execução. Itens marcados [BLOQ] devem sair antes do deploy.

### Tarefa 1 — Bugs funcionais críticos
- [ ] [BLOQ] B1.a Substituir `index` por `item.originalIndex ?? index` nos 3 handlers de InstallerJobDetail.jsx (linhas 727, 758, 818)
- [ ] [BLOQ] B1.b Adicionar validação `archived_indices` em `item_checkins.py:create_item_checkin` e `complete_item_checkout`
- [ ] [BLOQ] B2 Sincronizar PAUSE_REASONS frontend ↔ backend (eleger lista canônica, validar no backend)
- [ ] [BLOQ] B3 Encadear `api.processCheckoutGamification(checkin.id)` após `completeItemCheckout` em InstallerJobDetail.jsx (ou mover para backend)
- [ ] [BLOQ] B4 Adicionar `|| []` em `setInstallers` (Calendar) e `setRecentTransactions` (InstallerDashboard)
- [ ] [BLOQ] B5 Definir `CORS_ORIGINS` no Vercel para domínios próprios

### Tarefa 2 — Estabilidade do fluxo de check-in
- [ ] [BLOQ] M1 Paralelizar carregamento de pause logs com `Promise.allSettled`
- [ ] [BLOQ] M2 Adicionar flag `cancelled` em useEffect dos 4 arquivos do escopo
- [ ] M3 Adicionar `console.error` nos catches silenciosos do InstallerDashboard
- [ ] M6 Relaxar GPS_ACCURACY_LIMIT para 200m + permitir bypass com confirmação
- [ ] M9 Validar `archived_items` no backend (defesa em profundidade)

### Tarefa 3 — Agendamento e Google Calendar
- [ ] M4 Confirmação no `disconnectGoogleCalendar`
- [ ] M5 Usar `job.scheduled_time_end` quando existir no sync do Google
- [ ] M7 Esconder painel de drag em mobile
- [ ] M8 Passar duração no `checkScheduleConflicts`

### Tarefa 4 — Qualidade de código (pós-deploy)
- [ ] R1 Criar Error Boundary
- [ ] R2 Extrair modais inline de Calendar.jsx
- [ ] R3 Senha mínima 8 caracteres
- [ ] R4–R6 Otimizações menores

---

## Próximos passos sugeridos

1. **Hoje**: aplicar Tarefa 1 (5 bloqueadores) — mexem em 4 arquivos, baixo risco de regressão, alto impacto.
2. **Amanhã**: aplicar Tarefa 2 (estabilidade) — exige teste manual em mobile com 3G simulado.
3. **Antes do deploy**: smoke test do fluxo completo do instalador (check-in → pause → resume → checkout → ver moedas) em um job com 3+ itens, sendo 1 arquivado.
4. **Pós-deploy**: monitorar logs por 48h para confirmar que pause reasons vêm preenchidos e gamificação está disparando.
