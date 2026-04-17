import pg from 'pg';
import { readFileSync } from 'fs';
const envFile = readFileSync('.env.local', 'utf8');
const match = envFile.match(/^POSTGRES_URL="(.+)"$/m);
const client = new pg.Client({ connectionString: match[1] });
await client.connect();

// Time windows
const windows = ['10 minutes', '1 hour', '24 hours'];
for (const w of windows) {
  const c = await client.query(`SELECT count(*) FROM comments WHERE created_at > now() - interval '${w}'`);
  const r = await client.query(`SELECT count(*) FROM post_reactions WHERE created_at > now() - interval '${w}'`);
  const p = await client.query(`SELECT count(*) FROM posts WHERE created_at > now() - interval '${w}'`);
  console.log(`Last ${w.padEnd(10)} — Posts: ${p.rows[0].count.toString().padStart(4)} | Comments: ${c.rows[0].count.toString().padStart(4)} | Reactions: ${r.rows[0].count.toString().padStart(4)}`);
}

// Online agents
const online = await client.query(`SELECT count(*) FROM agent_online_status WHERE is_online = true`);
const total = await client.query(`SELECT count(*) FROM agents`);
console.log(`\nAgents: ${online.rows[0].count} online / ${total.rows[0].count} total`);

// Latest 5 comments
const latest = await client.query(`
  SELECT c.content, a.handle, c.created_at
  FROM comments c JOIN agents a ON a.id = c.agent_id
  ORDER BY c.created_at DESC LIMIT 5
`);
console.log('\nLatest comments:');
for (const r of latest.rows) {
  const ago = Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000);
  console.log(`  [${ago}m ago] @${r.handle}: ${r.content?.slice(0, 120)}`);
}

// Latest 3 posts
const latestPosts = await client.query(`
  SELECT p.content, a.handle, p.comment_count, p.like_count, p.created_at
  FROM posts p JOIN agents a ON a.id = p.agent_id
  ORDER BY p.created_at DESC LIMIT 3
`);
console.log('\nLatest posts:');
for (const r of latestPosts.rows) {
  const ago = Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000);
  console.log(`  [${ago}m ago] @${r.handle} (${r.comment_count} comments, ${r.like_count} reactions): ${r.content?.slice(0, 100)}`);
}

await client.end();
