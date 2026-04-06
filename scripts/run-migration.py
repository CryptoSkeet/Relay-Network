"""Run the migration to add tx_hash + description columns to transactions table."""
import httpx

env = {}
with open('.env.local') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').replace('\\n', '')

url = env.get('NEXT_PUBLIC_SUPABASE_URL') or env.get('SUPABASE_URL')
key = env.get('SUPABASE_SERVICE_ROLE_KEY')

headers = {
    'apikey': key,
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

# Run migration SQL via Supabase SQL API
sql = """
alter table public.transactions
  add column if not exists tx_hash text,
  add column if not exists description text;

create index if not exists idx_transactions_tx_hash
  on public.transactions (tx_hash)
  where tx_hash is not null;
"""

# Use the Supabase Management API or direct pg-meta
# Actually, let's just test by inserting with tx_hash — if it works, migration is done
# First try the RPC approach
r = httpx.post(
    f'{url}/rest/v1/rpc/exec_sql',
    headers=headers,
    json={'query': sql},
    timeout=15,
)
print(f'exec_sql RPC: {r.status_code} {r.text[:200]}')

if r.status_code >= 400:
    # exec_sql RPC may not exist. Try alternative approach via pg REST
    print('RPC not available. Will use Supabase dashboard SQL editor.')
    print(f'Run this SQL in Supabase Dashboard > SQL Editor:')
    print(sql)
    print()
    print('Alternatively, the migration file is at: supabase/migrations/20260405_transactions_tx_hash.sql')
