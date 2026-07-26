-- Migration-integrity gate. Run against STAGING *after* 004 + 005 are applied.
-- Every check documents its expected result; anything else is a FAILURE.
--
-- FIRST, before migrating, capture baseline counts (run on the pre-migration DB):
--   SELECT 'whiskeys' t, count(*) FROM whiskeys
--   UNION ALL SELECT 'settings', count(*) FROM settings
--   UNION ALL SELECT 'inventory_logs', count(*) FROM inventory_logs
--   UNION ALL SELECT 'inventory_monthly_snapshots', count(*) FROM inventory_monthly_snapshots;
-- Then re-run the same after migrating and confirm the counts are IDENTICAL.

\echo '== 1. No NULL bar_id (expect 0 for every table) =='
SELECT 'whiskeys' AS t, count(*) AS null_bar_ids FROM whiskeys WHERE bar_id IS NULL
UNION ALL SELECT 'settings', count(*) FROM settings WHERE bar_id IS NULL
UNION ALL SELECT 'inventory_logs', count(*) FROM inventory_logs WHERE bar_id IS NULL
UNION ALL SELECT 'inventory_monthly_snapshots', count(*) FROM inventory_monthly_snapshots WHERE bar_id IS NULL;

\echo '== 2. Existing data attached to the first bar (expect only 00000000-...-001) =='
SELECT bar_id, count(*) FROM whiskeys GROUP BY bar_id;

\echo '== 3. pin_hash column dropped (expect 0 rows) =='
SELECT column_name FROM information_schema.columns
WHERE table_name = 'settings' AND column_name = 'pin_hash';

\echo '== 4. settings PK is bar_id (expect: bar_id) =='
SELECT a.attname AS pk_column
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
WHERE i.indrelid = 'settings'::regclass AND i.indisprimary;

\echo '== 5. anon/authenticated SELECT revoked on all 4 tenant tables (expect 0 rows) =='
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated')
  AND privilege_type = 'SELECT'
  AND table_name IN ('whiskeys','settings','inventory_logs','inventory_monthly_snapshots');

\echo '== 6. whiskeys + inventory_logs removed from realtime publication (expect 0 rows) =='
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('whiskeys','inventory_logs');

\echo '== 7. DB functions all carry a bar_id (uuid) first arg; NO bar-blind overload survives =='
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
WHERE p.proname IN ('get_inventory_daily_trend','record_inventory_scan',
                    'overwrite_inventory_log','capture_monthly_inventory_snapshots')
ORDER BY 1, 2;
-- Expect every row's args to START WITH "uuid". A surviving "integer"-only or
-- "timestamp with time zone"-only signature is the C2 leak — FAIL.

\echo '== 8. anon/authenticated have NO EXECUTE on the trend function (expect 0 rows) =='
SELECT routine_name, grantee
FROM information_schema.role_routine_grants
WHERE routine_name = 'get_inventory_daily_trend'
  AND grantee IN ('anon','authenticated');
