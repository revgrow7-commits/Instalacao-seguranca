-- Migration 036: Remove item_assignments entries for archived items
-- Edge-case handled: when ALL assignments are archived, set item_assignments = '[]'.

WITH jobs_in_scope AS (
  SELECT id
  FROM jobs
  WHERE archived_items IS NOT NULL
    AND archived_items ~ '^\s*\['
    AND archived_items != '[]'
    AND item_assignments IS NOT NULL
    AND item_assignments ~ '^\s*\['
    AND item_assignments != '[]'
),
archived_indices AS (
  SELECT j.id, (arch_elem ->> 'item_index')::int AS idx
  FROM jobs j
  JOIN jobs_in_scope jis ON j.id = jis.id,
       jsonb_array_elements(j.archived_items::jsonb) AS arch_elem
),
kept_assignments AS (
  SELECT j.id,
    jsonb_agg(a_elem ORDER BY (a_elem ->> 'item_index')::int) AS kept
  FROM jobs j
  JOIN jobs_in_scope jis ON j.id = jis.id,
       jsonb_array_elements(j.item_assignments::jsonb) AS a_elem
  WHERE NOT EXISTS (
    SELECT 1 FROM archived_indices ai
    WHERE ai.id = j.id
      AND ai.idx = (a_elem ->> 'item_index')::int
  )
  GROUP BY j.id
)
UPDATE jobs j
SET item_assignments = COALESCE(ka.kept::text, '[]')
FROM jobs_in_scope jis
LEFT JOIN kept_assignments ka ON ka.id = jis.id
WHERE j.id = jis.id;
