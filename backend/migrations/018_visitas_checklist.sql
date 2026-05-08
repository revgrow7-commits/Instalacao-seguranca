-- Migration 018: Colunas de checklist de vistoria em visitas_tecnicas
-- Campos preenchidos pelo instalador ao confirmar a visita (ConfirmarVisitaForm, passos 1-2).
-- Sem essa migration as colunas não existem no DB e os dados são perdidos silenciosamente.

ALTER TABLE visitas_tecnicas
  ADD COLUMN IF NOT EXISTS tem_estacionamento       BOOLEAN,
  ADD COLUMN IF NOT EXISTS restricao_horario_inicio TIME,
  ADD COLUMN IF NOT EXISTS restricao_horario_fim    TIME,
  ADD COLUMN IF NOT EXISTS tipo_superficie          TEXT[],
  ADD COLUMN IF NOT EXISTS tipo_superficie_outro    TEXT,
  ADD COLUMN IF NOT EXISTS condicao_superficie      BOOLEAN,
  ADD COLUMN IF NOT EXISTS material_remocao         TEXT,
  ADD COLUMN IF NOT EXISTS tem_ponto_energia        BOOLEAN,
  ADD COLUMN IF NOT EXISTS medida_largura_m         NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS medida_altura_m          NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS forma_instalacao         TEXT[],
  ADD COLUMN IF NOT EXISTS epi_altura               BOOLEAN,
  ADD COLUMN IF NOT EXISTS escada_tamanho           TEXT,
  ADD COLUMN IF NOT EXISTS andaime_torres           INTEGER;

CREATE INDEX IF NOT EXISTS idx_vt_tem_estacionamento ON visitas_tecnicas(tem_estacionamento);
