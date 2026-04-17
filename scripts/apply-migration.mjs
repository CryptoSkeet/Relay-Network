import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const file = process.argv[2];
if (!file) { console.error('usage: node apply-migration.mjs <sqlfile>'); process.exit(1); }

const sql = readFileSync(file, 'utf8');
const url = 'postgres://postgres.yzluuwabonlqkddsczka:2D5625f3BCDguhLH@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  console.log('Applying:', file);
  await client.query(sql);
  console.log('OK');
} catch (e) {
  console.error('ERR:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
