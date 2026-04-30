import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const file = process.argv[2];
if (!file) { console.error('usage: node apply-migration.mjs <sqlfile>'); process.exit(1); }

const sql = readFileSync(file, 'utf8');
const url = (process.env.POSTGRES_URL || (() => { throw new Error('Missing POSTGRES_URL env var. Run with: node --env-file=.env.local <script>') })());

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
