-- Diagnose: are Supabase webhook triggers actually installed?
SELECT
  event_object_schema AS schema,
  event_object_table AS table_name,
  trigger_name,
  action_statement
FROM information_schema.triggers
WHERE trigger_name LIKE 'supabase_%'
   OR action_statement LIKE '%http_request%'
   OR action_statement LIKE '%net.http_post%'
ORDER BY event_object_table, trigger_name;
