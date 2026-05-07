-- Migration 016: Confirmação de Visitas Técnicas pelo Instalador
-- Adiciona fluxo AGUARDANDO_CONFIRMACAO entre agendamento e EM_VISITA.
-- Captura snapshot do plano admin e permite que o instalador confirme/rejeite a visita.

-- 1. Novas colunas em visitas_tecnicas
ALTER TABLE visitas_tecnicas
  ADD COLUMN IF NOT EXISTS confirmado_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmado_por     TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planejado_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS rejeitado_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejeitado_motivo   TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_instalador TEXT;

-- 2. Índice para auditoria/listagem por estado de confirmação
CREATE INDEX IF NOT EXISTS idx_vt_confirmado_em ON visitas_tecnicas(confirmado_em);

-- Nota: a coluna `status` é TEXT livre (sem CHECK constraint nem ENUM PostgreSQL),
-- então não há ALTER TYPE/CONSTRAINT necessário para aceitar 'AGUARDANDO_CONFIRMACAO'.
-- Visitas antigas com status 'AGUARDANDO' permanecem válidas (compatibilidade retroativa).

-- 3. Backfill: visitas já agendadas (com installer e data) passam para AGUARDANDO_CONFIRMACAO.
-- Garante que visitas existentes não quebrem com a nova regra do enviar_relatorio (exige EM_VISITA).
UPDATE visitas_tecnicas
SET status = 'AGUARDANDO_CONFIRMACAO'
WHERE status = 'AGUARDANDO'
  AND installer_id IS NOT NULL
  AND scheduled_date IS NOT NULL;
