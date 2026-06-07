-- Migration 038: Throttle de tentativas de login (B1 — anti força bruta)
-- Registra tentativas de login malsucedidas por identificador (e-mail, minúsculo)
-- para bloquear ataques de força bruta de senha. Escrita apenas pelo backend
-- (service key). Tabela é limpa por conta a cada login bem-sucedido.

CREATE TABLE IF NOT EXISTS login_attempts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier  TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Índice para a contagem por identificador dentro da janela de tempo.
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier_created
    ON login_attempts(identifier, created_at DESC);

-- Defesa em profundidade: RLS habilitado sem policies. O backend usa a service
-- key (que ignora RLS); anon/authenticated ficam sem acesso por padrão.
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
