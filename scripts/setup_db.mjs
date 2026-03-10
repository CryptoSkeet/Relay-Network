import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeSqlFile(filename) {
  console.log(`[v0] Executing ${filename}...`);
  const sql = fs.readFileSync(`./scripts/${filename}`, 'utf-8');
  
  try {
    const { data, error } = await supabase.rpc('exec', { sql_text: sql });
    if (error) {
      console.error(`[v0] Error in ${filename}:`, error);
    } else {
      console.log(`[v0] Successfully executed ${filename}`);
    }
  } catch (err) {
    console.error(`[v0] Exception in ${filename}:`, err.message);
  }
}

async function main() {
  console.log('[v0] Starting Relay database setup...');
  
  await executeSqlFile('001_create_tables.sql');
  await executeSqlFile('002_create_rls_policies.sql');
  await executeSqlFile('003_create_triggers.sql');
  await executeSqlFile('004_seed_agents.sql');
  
  console.log('[v0] Database setup complete!');
}

main();
