-- Migration 013: Expansão de Visitas Técnicas
-- Adiciona campos de km_ida/km_volta, job_id, vendedor, tipos_servico,
-- ferramentas, remoção, altura, nível de dificuldade e status de aprovação.

-- 1. Adicionar km_ida/km_volta antes do drop para preservar dados existentes
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS km_ida NUMERIC(10,2);
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS km_volta NUMERIC(10,2);

-- Backfill: copiar km_rodados para km_ida (preserva dado existente)
UPDATE visitas_tecnicas SET km_ida = km_rodados WHERE km_rodados IS NOT NULL AND km_ida IS NULL;

-- Dropar coluna GENERATED (valor_total) e km_rodados
ALTER TABLE visitas_tecnicas DROP COLUMN IF EXISTS valor_total;
ALTER TABLE visitas_tecnicas DROP COLUMN IF EXISTS km_rodados;

-- 2. Recriar valor_total como GENERATED com soma de ida + volta
ALTER TABLE visitas_tecnicas ADD COLUMN valor_total NUMERIC(12,2)
  GENERATED ALWAYS AS (
    (COALESCE(km_ida, 0) + COALESCE(km_volta, 0)) * COALESCE(valor_por_km, 0)
  ) STORED;

-- 4. Vínculo com Job/OS
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL;

-- 5. Vendedor (desnormalizado)
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS vendedor_nome TEXT;

-- 6. Arrays de multi-select (nomes como text[])
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS tipos_servico TEXT[] DEFAULT '{}';
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS ferramentas TEXT[] DEFAULT '{}';

-- 7. Campos booleanos de remoção
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS remocao_prevista_os BOOLEAN DEFAULT false;
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS remocao_a_realizar BOOLEAN DEFAULT false;

-- 8. Altura e dificuldade
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS altura_estimada_m NUMERIC(6,2);
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS nivel_dificuldade SMALLINT CHECK (nivel_dificuldade BETWEEN 1 AND 4);

-- 9. Status de aprovação (separado do status operacional)
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS aprovacao_status TEXT DEFAULT 'PENDENTE'
  CHECK (aprovacao_status IN ('PENDENTE', 'APROVADO', 'NAO_APROVADO'));

-- 10. Índices
CREATE INDEX IF NOT EXISTS idx_vt_job_id ON visitas_tecnicas(job_id);
CREATE INDEX IF NOT EXISTS idx_vt_aprovacao ON visitas_tecnicas(aprovacao_status);
