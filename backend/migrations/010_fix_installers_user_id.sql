-- ============================================================
-- 010_fix_installers_user_id.sql
-- Corrige o vínculo entre installers.user_id e users.id,
-- garante rows em installers para todo user com role='installer',
-- cria GIN index em jobs.assigned_installers e normaliza
-- jobs.archived NULL → false.
--
-- SEGURO para re-execução (idempotente via IF NOT EXISTS /
-- ON CONFLICT DO NOTHING / WHERE guards).
-- ============================================================

-- ============================================================
-- PASSO 1: Backfill installers.user_id onde NULL
-- Estratégia: match por nome case-insensitive (full_name do
-- installer vs name ou full_name do user).
-- RISCO: nomes homônimos gerariam vínculo errado.
-- Proteção: só atualiza quando o match é ÚNICO (COUNT = 1).
-- ============================================================

WITH name_matches AS (
    -- Para cada installer sem user_id, encontra candidatos em users
    -- pelo melhor nome disponível (coalesce name → full_name).
    SELECT
        i.id                        AS installer_id,
        u.id                        AS user_id,
        COUNT(*) OVER (
            PARTITION BY i.id
        )                           AS match_count
    FROM installers i
    JOIN users u
        ON u.role = 'installer'
        AND LOWER(i.full_name) = LOWER(COALESCE(u.name, u.full_name))
    WHERE i.user_id IS NULL
),
unique_matches AS (
    -- Filtra apenas matches sem ambiguidade (exatamente 1 user por installer)
    SELECT installer_id, user_id
    FROM name_matches
    WHERE match_count = 1
)
UPDATE installers AS i
SET    user_id = um.user_id
FROM   unique_matches um
WHERE  i.id = um.installer_id
  AND  i.user_id IS NULL;  -- guarda extra: nunca sobrescrever user_id já preenchido

-- ============================================================
-- PASSO 2: Criar rows em installers para users com
-- role='installer' que ainda não possuam vínculo.
-- RISCO: criar duplicatas se o match de nome acima falhou mas
-- já existe um installer "órfão" com o mesmo nome.
-- Proteção: verifica ausência de user_id = users.id E ausência
-- de nome idêntico (evita duplicate phantom rows).
-- Usa gen_random_uuid()::text como PK do novo installer.
-- ============================================================

INSERT INTO installers (
    id,
    user_id,
    full_name,
    branch,
    is_active,
    coins,
    level,
    created_at
)
SELECT
    gen_random_uuid()::text                     AS id,
    u.id                                        AS user_id,
    COALESCE(u.name, u.full_name, u.email)      AS full_name,
    COALESCE(u.branch, 'POA')                   AS branch,
    TRUE                                        AS is_active,
    0                                           AS coins,
    1                                           AS level,
    NOW()                                       AS created_at
FROM users u
WHERE u.role = 'installer'
  -- Não existe nenhum installer já vinculado a este user
  AND NOT EXISTS (
      SELECT 1
      FROM installers i
      WHERE i.user_id = u.id
  )
  -- Proteção extra: não criar se já existe installer com nome idêntico
  -- (pode ser o "órfão" que o PASSO 1 deveria ter vinculado mas não vinculou
  --  por ambiguidade — deixar para resolução manual nesses casos)
  AND NOT EXISTS (
      SELECT 1
      FROM installers i
      WHERE LOWER(i.full_name) = LOWER(COALESCE(u.name, u.full_name))
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- PASSO 3: GIN index em jobs.assigned_installers
-- Necessário para buscas JSONB eficientes do tipo:
--   WHERE assigned_installers @> '[{"id": "..."}]'
-- RISCO: criação de index bloqueia escritas brevemente em
-- tabelas muito grandes. Usar CONCURRENTLY em produção ativa.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_jobs_assigned_installers_gin
    ON jobs USING GIN (assigned_installers);

-- ============================================================
-- PASSO 4: Normalizar jobs.archived NULL → false
-- Não altera tipo nem adiciona NOT NULL (pode haver rows
-- legadas sem valor explícito). Apenas preenche NULLs.
-- RISCO: nenhum — UPDATE seguro com WHERE guard.
-- ============================================================

UPDATE jobs
SET    archived = FALSE
WHERE  archived IS NULL;

-- ============================================================
-- Verificação diagnóstica (retorna linhas — não bloqueia deploy)
-- ============================================================

-- Installers ainda sem user_id após o backfill
-- (indica casos de ambiguidade ou nomes sem match — resolução manual)
SELECT
    'installers_sem_user_id' AS diagnostico,
    COUNT(*)                 AS total
FROM installers
WHERE user_id IS NULL;

-- Users instaladores sem row em installers
-- (não deve haver nenhum após PASSO 2)
SELECT
    'users_installer_sem_row_installers' AS diagnostico,
    COUNT(*)                             AS total
FROM users u
WHERE u.role = 'installer'
  AND NOT EXISTS (
      SELECT 1 FROM installers i WHERE i.user_id = u.id
  );
