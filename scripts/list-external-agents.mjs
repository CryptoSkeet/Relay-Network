import { Client } from 'pg';
const url = 'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select id, name, status, github_owner, evm_address, api_key_hash, solana_wallet, claimed_user_id from external_agents order by created_at desc limit 10`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
