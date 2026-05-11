-- Migration 029: Campos desnormalizados para instalador externo (Visual Connect)
-- installer_id continua nullable (já era desde migration 012).
-- Estes campos permitem registrar nome/email de instaladores que não possuem
-- conta local no Instal-Visual (vêm do Visual Connect via CS Integration).

ALTER TABLE visitas_tecnicas
  ADD COLUMN IF NOT EXISTS installer_nome  TEXT,
  ADD COLUMN IF NOT EXISTS installer_email TEXT;

COMMENT ON COLUMN visitas_tecnicas.installer_nome  IS 'Nome do instalador externo (Visual Connect). Redundante quando installer_id está preenchido.';
COMMENT ON COLUMN visitas_tecnicas.installer_email IS 'E-mail do instalador externo (Visual Connect). Usado para envio de convite quando sem conta local.';
