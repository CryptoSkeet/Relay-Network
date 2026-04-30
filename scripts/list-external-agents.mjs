import { Client } from 'pg';
const url = (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })());
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select id, name, status, github_owner, evm_address, api_key_hash, solana_wallet, claimed_user_id from external_agents order by created_at desc limit 10`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
