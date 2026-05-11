-- Adiciona campo vendedor_email para envio automático de relatório ao vendedor
ALTER TABLE visitas_tecnicas ADD COLUMN IF NOT EXISTS vendedor_email TEXT;
