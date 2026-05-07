-- Migration 018: documenta colunas do checklist de vistoria
-- Estas colunas já existem em produção (foram aplicadas via SQL Editor sem migration versionada).
-- ADD COLUMN IF NOT EXISTS garante idempotência em ambientes recriados do zero.
-- Contexto: usadas pelo wizard de 4 passos em ConfirmarVisitaForm.jsx.

ALTER TABLE visitas_tecnicas
    ADD COLUMN IF NOT EXISTS tem_estacionamento         BOOLEAN,
    ADD COLUMN IF NOT EXISTS restricao_horario_inicio   TEXT,
    ADD COLUMN IF NOT EXISTS restricao_horario_fim      TEXT,
    ADD COLUMN IF NOT EXISTS tipo_superficie            TEXT[]   DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS tipo_superficie_outro      TEXT,
    ADD COLUMN IF NOT EXISTS condicao_superficie        BOOLEAN,
    ADD COLUMN IF NOT EXISTS material_remocao           TEXT,
    ADD COLUMN IF NOT EXISTS tem_ponto_energia          BOOLEAN,
    ADD COLUMN IF NOT EXISTS medida_largura_m           NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS medida_altura_m            NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS forma_instalacao           TEXT[]   DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS epi_altura                 BOOLEAN,
    ADD COLUMN IF NOT EXISTS escada_tamanho             TEXT,
    ADD COLUMN IF NOT EXISTS andaime_torres             INTEGER;
