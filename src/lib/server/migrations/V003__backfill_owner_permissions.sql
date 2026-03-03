INSERT OR IGNORE INTO project_permissions (id, project_id, user_id, permission)
SELECT
  'perm_' || pi.user_id || '_' || json_extract(je.value, '$.id'),
  json_extract(je.value, '$.id'),
  pi.user_id,
  'owner'
FROM project_index pi, json_each(json_extract(pi.data, '$.projects')) je
WHERE pi.user_id != 'singleton'
  AND NOT EXISTS (
    SELECT 1 FROM project_permissions pp
    WHERE pp.project_id = json_extract(je.value, '$.id')
      AND pp.user_id = pi.user_id
      AND pp.permission = 'owner'
  );
