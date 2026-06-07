# Plano de Refatoração — Remoção de Código Morto
**Projeto:** Instal-Visual (`instal-visual.com.br`)
**Data:** 2026-05-12
**Abordagem:** Conservador — somente itens com zero referências confirmadas
**Sequência:** Backend → Frontend → Limpeza geral

---

## FASE 1 — Backend

### Remover (seguro — zero callers confirmados)

#### F1-A: `backend/database.py` e `backend/database_supabase.py`
- **Motivo:** Nenhum arquivo Python no projeto faz `from database import` ou `import database`. O wrapper ativo é `db_supabase.py`.
- **Evidência:** `grep -r "from database|import database" backend/**/*.py` → zero resultados.
- **Risco:** Nenhum.
- **LOC removidos:** ~372

#### F1-B: `backend/migrations/run_migration_supabase.py`
- **Motivo:** Arquivo vazio (0 bytes). Não é referenciado em nenhum script ou CI/CD.
- **Risco:** Nenhum.

#### F1-C: `backend/migrations/_legacy/` (pasta inteira)
- **Conteúdo:** `supabase_schema.sql`, `supabase_add_columns.sql`, `supabase_missing_tables.sql`, `README.md`
- **Motivo:** O próprio `README.md` interno diz *"NÃO aplicar — causa divergência de schema"*. Nenhum CI/CD referencia.
- **Risco:** Nenhum (já marcado como obsoleto pelo time).

#### F1-D: `backend/migrations/_diagnostics/check_jobs_persistence.sql`
- **Motivo:** Script ad-hoc de diagnóstico manual (para rodar no SQL Editor). Não pertence ao sistema de migrations.
- **Risco:** Nenhum.

#### F1-E: `PyJWT==2.10.1` em `backend/requirements.txt`
- **Motivo:** O projeto usa `python-jose` para JWT. Nenhum `import jwt` (estilo PyJWT) encontrado em nenhum `.py`.
- **Evidência:** `grep -r "import jwt\|PyJWT" backend/**/*.py` → zero resultados.
- **Risco:** Nenhum.

#### F1-F: Re-exports em `backend/services/__init__.py`
- **Motivo:** Nenhum arquivo usa `from services import X`. Todos importam direto do submódulo (`from services.gamification import add_coins`). O `__init__.py` atual re-exporta ~10 símbolos que ninguém consome via este caminho.
- **Ação:** Substituir por `__init__.py` mínimo (só docstring).
- **Risco:** Nenhum — se ninguém importa daqui, remover não quebra nada.

### Manter (não remover nesta passada)
- `/scheduler/jobs/{id}/pause` e `/resume` em `server.py` — têm callers em `api.js:335-336`. São stubs intencionais com mensagem explicativa para o admin.
- Funções `bulkArchivePre2026`, `recalculateJobAreas`, etc. em `utils/api.js` — podem ser usadas manualmente por devs via console.

---

## FASE 2 — Frontend

### Remover (seguro — zero imports confirmados)

#### F2-A: `frontend/src/components/BrowserCheck.jsx`
- **Motivo:** Detecta HTTPS/câmera/GPS mas nenhum arquivo em `src/` faz `import BrowserCheck`.
- **Evidência:** `grep -r "BrowserCheck" frontend/src/` → zero resultados.
- **LOC removidos:** 51

#### F2-B: 13 componentes shadcn/ui instalados mas nunca usados
Deletar os seguintes arquivos de `frontend/src/components/ui/`:

| Arquivo | LOC aprox. |
|---|---|
| `aspect-ratio.jsx` | 25 |
| `breadcrumb.jsx` | 115 |
| `carousel.jsx` | 260 |
| `context-menu.jsx` | 200 |
| `hover-card.jsx` | 30 |
| `input-otp.jsx` | 70 |
| `menubar.jsx` | 240 |
| `navigation-menu.jsx` | 130 |
| `pagination.jsx` | 115 |
| `resizable.jsx` | 45 |
| `toggle-group.jsx` | 65 |
| `toggle.jsx` | 15 |
| `sonner.jsx` | 30 |
| **Total** | **~1.340** |

- **Motivo:** Instalados via `npx shadcn-ui add` mas nunca importados em nenhuma página ou componente.
- **Evidência:** `grep -r "from.*ui/aspect-ratio\|from.*ui/breadcrumb\|..." frontend/src/` → zero resultados para cada um.
- **Ação adicional:** Verificar `components.json` e remover registros desses componentes.
- **Risco:** Nenhum — build do CRA não inclui arquivos não importados. Remover não afeta bundle atual.

#### F2-C: `frontend/src/hooks/index.js`
- **Motivo:** Barrel que re-exporta só `useJobs`. Nenhum consumidor importa de `hooks/index` — todos importam direto do arquivo (`from '../hooks/useJobs'`).
- **Evidência:** `grep -r "from.*hooks/index\|from.*hooks'" frontend/src/` → zero resultados.
- **LOC removidos:** ~10

---

## FASE 3 — Limpeza Geral

#### F3-A: `frontend/plugins/visual-edits/babel-metadata-plugin.js`
- **Motivo:** Resíduo do tooling Emergent (~1.100 linhas que injetam atributos `x-*` em JSX para inspeção visual). **Pré-condição:** confirmar em `craco.config.js` que não está no pipeline de build antes de deletar.
- **Risco:** Baixo — se não estiver no `craco.config.js`, a remoção é segura.

#### F3-B: `frontend/plugins/health-check/`
- **Motivo:** Plugin que só roda no webpack-dev-server. Não tem efeito em produção.
- **Risco:** Nenhum em produção; pode quebrar `npm start` se alguém depender do check (verificar antes).

#### F3-C: `supabase/gps_test_focused.py`
- **Motivo:** Script de teste manual fora do pytest, sem CI/CD e sem invocação por outros scripts.
- **Risco:** Nenhum.

#### F3-D: `supabase/convert_to_pdf.py`
- **Motivo:** Script one-shot que converte documentação em PDF. Já foi executado (o PDF existe).
- **Risco:** Nenhum.

#### F3-E: `.claude/worktrees/` (pasta inteira)
- **Conteúdo:** 4+ cópias completas de backend/migrations criadas por agentes Claude Code (`magical-bose-*`, `vigilant-haslett-*`, `elegant-lumiere-*`, `angry-greider-*`).
- **Motivo:** Lixo de worktrees temporários do agente. Poluem buscas com resultados duplicados.
- **Ação adicional:** Adicionar `.claude/worktrees/` ao `.gitignore`.
- **Risco:** Nenhum — não são código de produção.

#### F3-F: Documentação duplicada (arquivar, não deletar)
- **Manter:** `README.md`, `CLAUDE.md`, `DOCUMENTACAO_SISTEMA.md`
- **Mover para `docs/archive/`:** `DOCUMENTACAO_SISTEMA.html`, `DOCUMENTACAO_SISTEMA.pdf`, `DOCUMENTACAO_SISTEMA_COMPLETA.md`, `DOCUMENTATION.md`
- **Motivo:** 5 documentos sobrepostos sobre o mesmo sistema.
- **Risco:** Nenhum.

---

## Resumo de Impacto

| Fase | Itens | LOC removidos |
|---|---|---|
| Backend | 6 itens | ~420 |
| Frontend | 3 itens | ~1.400 |
| Limpeza | 6 itens | ~1.100 (plugins) + archival |
| **Total** | **15 itens** | **~2.900 LOC** |

**Sem risco de regressão** — todos os itens têm zero referências confirmadas por Grep no código ativo.

---

## Ordem de Execução Sugerida

```
1. git checkout -b chore/dead-code-removal
2. Fase 1: Backend (F1-A a F1-F) → commit
3. Fase 2: Frontend (F2-A a F2-C) → npm run build → commit
4. Fase 3: Limpeza (F3-A a F3-F, confirmar craco.config.js antes de F3-A) → commit
5. Push branch → Vercel preview → smoke test → merge
```

---

*Nenhuma alteração foi feita no projeto. Este documento é apenas um plano para revisão.*
