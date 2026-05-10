# Migrations Log — Instal-Visual

Este arquivo documenta quais migrations existem apenas localmente vs. aplicadas via SQL Editor no banco de produção (`qfsxtwkltfraounsjjah`). Evita reaplicação acidental.

## Divergências conhecidas (estado 2026-05-08)

### Apenas locais (não aparecem em `list_migrations` remoto — aplicadas antes do tracking via Supabase)

| Arquivo local | Motivo |
|---|---|
| `002_cleanup_and_fix.sql` | Aplicada diretamente no banco antes do sistema de migrations estar ativo |
| `003_performance_indexes.sql` | Idem |
| `010_fix_installers_user_id.sql` | Aplicada como "fix_assigned_installers_type_and_gin_index" no remoto (nome diferente) |
| `012_visitas_tecnicas.sql` | Conteúdo aplicado via SQL Editor diretamente |
| `016_visitas_confirmacao.sql` | Conteúdo aplicado via SQL Editor diretamente |

### Apenas remotas (sem arquivo local — aplicadas via SQL Editor no painel Supabase)

| Nome remoto | Descricao |
|---|---|
| `20260408222802_create_schema` | Schema inicial |
| `add_arquivado_to_jobs_status_check` | CHECK constraint `archived` |
| `add_justificado_to_jobs_status_check` | CHECK constraint `justificado` |
| `add_agendado_to_jobs_status_check` | CHECK constraint `agendado` |
| `fix_job_justifications_schema` | Corrige schema de justificativas |
| `jobs_unique_holdprint_id` | UNIQUE constraint em `holdprint_job_id` |
| `photo_storage_urls` | Adiciona `*_photo_url` columns |

## Conflito de numeracao

`010_fix_installers_user_id.sql` e `010b_add_scheduled_time_end_google_token.sql` tem o mesmo prefixo original.
`010b` foi renomeado em 2026-05-08 para evitar confusao. Nenhum dos dois deve ser reaplicado.

## Migrations aplicadas via Supabase MCP (confirmadas)

011, 013, 014, 015, 017, 018, 019, 021 (RLS lockdown), 022 (indexes FK) — todas via `apply_migration`.

## Proximas migrations

Numerar a partir de `023_`.
