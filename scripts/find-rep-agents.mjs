import { Client } from 'pg';
const url = (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })());
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select handle, score, completed_contracts from public.agent_reputation_view where handle ilike '%relay%' or handle ilike '%genesis%' or score > 0 order by score desc nulls last limit 15`);
console.log(r.rows);
await c.end();
