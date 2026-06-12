---
description: Loop automático de revisão — entende as regras de negócio, analisa, corrige, testa e valida até não restar problema crítico
---

Execute o LOOP DE REVISÃO sobre: $ARGUMENTS (se vazio, sobre as mudanças não commitadas + último commit).

### 0. CONTEXTO OBRIGATÓRIO (antes de qualquer análise)
- Leia `docs/REGRAS-DE-NEGOCIO.md` — é a fonte canônica de como o sistema DEVE se comportar.
- Leia a seção do CLAUDE.md da sessão atual e, se a mudança tocar área sensível, o doc correspondente: EXIF/fuso → regra 3 e 4; auth/senha → regra 5; banco → regra 6; SW/deploy → regra 7.
- Toda divergência entre código e regra documentada = PARE e pergunte ao usuário antes de "corrigir".

## Loop (repita até 2 passadas limpas consecutivas, máx. 5 iterações)

### 1. ANALISAR
- `git diff` + `git diff --staged` + `git show HEAD --stat` — entenda o que mudou.
- Confronte cada mudança com as regras de negócio do passo 0: a mudança viola alguma regra? (fuso EXIF naive = BRT nunca UTC; checkout nunca bloqueado por clique/item arquivado; mutação invalida cache; coluna nova no TABLE_COLUMNS; rota com Depends(get_current_user); senha 8+ com letra e número.)
- Procure também: exceção engolida sem log, `find()` sem limite em listagem, estado React sem cleanup/guard de unmount, duplicação de função que já existe em lib/ ou services/.

### 2. CORRIGIR
- Correções mínimas e cirúrgicas. NÃO refatore arquivos gigantes (JobDetail.jsx, jobs.py) dentro do loop.
- Se a correção muda comportamento de negócio: atualize `docs/REGRAS-DE-NEGOCIO.md` no mesmo commit.

### 3. TESTAR
- Backend: `cd backend && python -m compileall -q .` (zero output = OK).
- Frontend: `cd frontend && npm run build` — precisa de "Compiled successfully".
- Se a mudança tocou rota da API: smoke com curl no endpoint (GET apenas).

### 4. VALIDAR
- `git grep` pelos símbolos removidos/renomeados — zero referências órfãs.
- Se tocou `public/` ou Service Worker: confira coerência do sentinel/SW (CACHE_VERSION, querystring preservada).
- Releia a regra de negócio afetada e confirme que o comportamento final a respeita.

### 5. DOCUMENTAR
- Mudança de comportamento/regra/pendência ⇒ atualizar CLAUDE.md (sessão atual) e docs/REGRAS-DE-NEGOCIO.md.

## Regras do loop
- Uma iteração só termina quando os 5 passos rodaram.
- Encerre APENAS quando uma passada inteira não encontrar nada novo E os testes passarem — aí faça a passada de confirmação.
- Se a mesma falha reaparecer 2 vezes, pare e reporte ao usuário em vez de insistir.
- NÃO faça deploy nem push dentro do loop — só quando o usuário pedir.
- Ao final, resuma: iterações, problemas encontrados/corrigidos por categoria, regras de negócio tocadas, melhorias futuras registradas.
