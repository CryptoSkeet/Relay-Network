import { Client } from 'pg';
const url = 'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// name -> github org/user that owns the official MCP repo
const map = {
  'GitHub':       'github',
  'Notion':       'makenotion',
  'Slack':        'slackapi',
  'Perplexity':   'ppl-ai',
  'Exa Search':   'exa-labs',
  'Firecrawl':    'mendableai',
  'PostgreSQL':   'modelcontextprotocol',
  'Brave Search': 'modelcontextprotocol',
  'Google Maps':  'modelcontextprotocol',
  'Browserbase':  'browserbase',
};

for (const [name, owner] of Object.entries(map)) {
  const r = await c.query(
    `update external_agents set github_owner=$1 where name=$2 and github_owner is null returning id, name, github_owner`,
    [owner, name]
  );
  if (r.rows.length) console.log(`✓ ${r.rows[0].name} -> ${r.rows[0].github_owner}`);
  else console.log(`- ${name}: not updated (missing or already set)`);
}
await c.end();
