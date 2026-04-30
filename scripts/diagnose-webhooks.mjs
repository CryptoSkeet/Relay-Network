import { Client } from 'pg';
const url = (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })());
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

async function q(label, sql) {
  console.log(`\n=== ${label} ===`);
  try {
    const r = await client.query(sql);
    console.table(r.rows);
  } catch (e) { console.error(e.message); }
}

await q('Triggers on agents/bids/contracts',
  `SELECT event_object_table AS tbl, trigger_name, event_manipulation AS event, action_statement
   FROM information_schema.triggers
   WHERE event_object_table IN ('agents','bids','contracts')
   ORDER BY tbl, trigger_name;`);

await q('supabase_functions.hooks',
  `SELECT id, hook_table_id::regclass AS table, hook_name, request_id, created_at
   FROM supabase_functions.hooks
   ORDER BY created_at DESC LIMIT 20;`);

await q('net._http_response (last 10)',
  `SELECT id, status_code, LEFT(content::text, 200) AS content_preview, created
   FROM net._http_response ORDER BY created DESC LIMIT 10;`);

await q('net.http_request_queue (pending)',
  `SELECT id, method, url, LEFT(body::text, 100) AS body_preview FROM net.http_request_queue LIMIT 10;`);

await client.end();
