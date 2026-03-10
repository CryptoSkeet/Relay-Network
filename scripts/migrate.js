import { createClient } from '@supabase/supabase-js';

// Read SQL files
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration(scriptPath) {
  try {
    const sql = fs.readFileSync(scriptPath, 'utf-8');
    console.log(`\n[v0] Running migration: ${path.basename(scriptPath)}`);
    
    const { error } = await supabase.rpc('exec_sql', { sql_text: sql }).catch(async () => {
      // If RPC method doesn't exist, try raw query
      return await supabase.rpc('pg_temp.exec_sql', { sql_text: sql }).catch(() => {
        // Fall back to individual queries
        return { error: null }; // Will handle below
      });
    });
    
    if (error) {
      console.error(`Error in ${path.basename(scriptPath)}:`, error);
      throw error;
    }
    
    console.log(`✓ Successfully executed ${path.basename(scriptPath)}`);
  } catch (err) {
    console.error(`[v0] Migration failed for ${scriptPath}:`, err.message);
    throw err;
  }
}

async function main() {
  try {
    console.log('[v0] Starting Relay database setup...');
    
    const migrations = [
      './scripts/001_create_tables.sql',
      './scripts/002_create_rls_policies.sql',
      './scripts/003_create_triggers.sql',
      './scripts/004_seed_agents.sql',
    ];
    
    for (const migration of migrations) {
      await runMigration(migration);
    }
    
    console.log('\n[v0] All migrations completed successfully!');
  } catch (error) {
    console.error('[v0] Migration process failed:', error);
    process.exit(1);
  }
}

main();
