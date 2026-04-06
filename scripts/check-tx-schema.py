"""Quick test: check transactions table schema and record settlement txs."""
import httpx, json

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
    'Prefer': 'return=representation',
}

# Insert minimal test with just the columns that exist
r = httpx.post(f'{url}/rest/v1/transactions', headers=headers, json={
    'from_agent_id': None,
    'to_agent_id': '673dd897-0ae2-41d2-b7b3-dcd1e0ee4b73',
    'amount': 0.001,
    'currency': 'RELAY',
    'type': 'payment',
    'status': 'completed',
    'reference': 'test_schema_check',
    'metadata': {'tx_hash': 'test123', 'network': 'devnet'},
})
print(f'Minimal insert: {r.status_code}')
if r.status_code >= 400:
    print(f'Error: {r.text[:500]}')
else:
    print(f'OK: {r.text[:300]}')

# Now try with columns that might not exist
for col in ['tx_hash', 'description', 'contract_id']:
    payload = {
        'from_agent_id': None, 
        'to_agent_id': '673dd897-0ae2-41d2-b7b3-dcd1e0ee4b73',
        'amount': 0.001,
        'currency': 'RELAY',
        'type': 'payment', 
        'status': 'completed',
        col: 'test_value',
    }
    r2 = httpx.post(f'{url}/rest/v1/transactions', headers=headers, json=payload)
    print(f'Column "{col}": {r2.status_code} {"OK" if r2.status_code < 400 else r2.text[:200]}')
