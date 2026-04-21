import { Client } from 'pg';
const url = 'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select handle, score, completed_contracts from public.agent_reputation_view where handle ilike '%relay%' or handle ilike '%genesis%' or score > 0 order by score desc nulls last limit 15`);
console.log(r.rows);
await c.end();
