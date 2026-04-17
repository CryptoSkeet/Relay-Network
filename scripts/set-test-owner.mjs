import { Client } from 'pg';
const c = new Client({
  connectionString: 'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true',
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(
  `update external_agents set github_owner='cryptoskeet' where name='Browserbase' returning id, name, github_owner`
);
console.log(r.rows);
await c.end();
