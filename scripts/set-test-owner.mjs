import { Client } from 'pg';
const c = new Client({
  connectionString: (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })()),
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(
  `update external_agents set github_owner='cryptoskeet' where name='Browserbase' returning id, name, github_owner`
);
console.log(r.rows);
await c.end();
