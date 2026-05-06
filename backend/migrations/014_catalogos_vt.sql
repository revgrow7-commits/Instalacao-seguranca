-- Migration 014: Catálogos de Visitas Técnicas
-- Cria tabelas de catálogo: vendedores, tipos_servico, ferramentas_vt

CREATE TABLE IF NOT EXISTS vendedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tipos_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ferramentas_vt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Seeds: Vendedores
INSERT INTO vendedores (nome) VALUES
  ('TANIA'),
  ('DADO'),
  ('CRISTIANO'),
  ('GABI'),
  ('GABRIELLI')
ON CONFLICT (nome) DO NOTHING;

-- Seeds: Tipos de Serviço
INSERT INTO tipos_servico (nome) VALUES
  ('ADESIVO'),
  ('LONA'),
  ('ACM'),
  ('PVC'),
  ('MDF/ADESIVO'),
  ('MDF/PVC'),
  ('TOTEM'),
  ('LUMINOSO'),
  ('PS2/LONA'),
  ('TECIDO/ADESIVO'),
  ('QUADRO ACM'),
  ('ACRILICO CRISTAL'),
  ('ADESIVO/PISO')
ON CONFLICT (nome) DO NOTHING;

-- Seeds: Ferramentas
INSERT INTO ferramentas_vt (nome) VALUES
  ('Escada simples'),
  ('Escada extensível'),
  ('Andaime'),
  ('Plataforma elevatória (PTA)'),
  ('Furadeira'),
  ('Martelete'),
  ('Veículo de carga'),
  ('Caminhão com cesto')
ON CONFLICT (nome) DO NOTHING;
