-- Migration 012: Visitas Técnicas
-- Cria tabela visitas_tecnicas e tabela app_settings

-- Sequência para numero_vt
CREATE SEQUENCE IF NOT EXISTS vt_seq START 1;

CREATE TABLE IF NOT EXISTS visitas_tecnicas (
  id TEXT PRIMARY KEY,
  numero_vt TEXT UNIQUE NOT NULL DEFAULT 'VT-' || LPAD(nextval('vt_seq')::TEXT, 4, '0'),
  titulo TEXT NOT NULL DEFAULT 'VISITA TÉCNICA',
  client_name TEXT NOT NULL,
  client_address TEXT NOT NULL,
  branch TEXT NOT NULL,
  installer_id TEXT REFERENCES installers(id) ON DELETE SET NULL,
  scheduled_date TIMESTAMPTZ,
  scheduled_time_end TIMESTAMPTZ,
  valor_por_km NUMERIC(10,2) NOT NULL DEFAULT 1.50,
  km_rodados NUMERIC(10,2),
  valor_total NUMERIC(12,2) GENERATED ALWAYS AS (COALESCE(km_rodados,0) * valor_por_km) STORED,
  status TEXT NOT NULL DEFAULT 'AGUARDANDO',
  observacoes_admin TEXT,
  relatorio_descricao TEXT,
  relatorio_situacao TEXT,
  relatorio_fotos JSONB DEFAULT '[]'::jsonb,
  relatorio_assinatura_confirmada BOOLEAN DEFAULT false,
  relatorio_chegada TIMESTAMPTZ,
  relatorio_saida TIMESTAMPTZ,
  relatorio_enviado_em TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vt_status ON visitas_tecnicas(status);
CREATE INDEX IF NOT EXISTS idx_vt_installer ON visitas_tecnicas(installer_id);
CREATE INDEX IF NOT EXISTS idx_vt_branch ON visitas_tecnicas(branch);
CREATE INDEX IF NOT EXISTS idx_vt_scheduled ON visitas_tecnicas(scheduled_date);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO app_settings(key,value) VALUES ('vt_default_valor_por_km','1.50'::jsonb)
  ON CONFLICT(key) DO NOTHING;
