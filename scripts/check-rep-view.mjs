import { Client } from 'pg';
const url = (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })());
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select handle, score, completed_contracts, is_verified from public.agent_reputation_view where handle = 'relay-genesis'`);
console.log('rows:', r.rows);
const all = await c.query(`select count(*)::int as n from public.agent_reputation_view`);
console.log('total agents in view:', all.rows[0].n);
await c.end();
