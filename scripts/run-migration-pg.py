"""Run migration directly via PostgreSQL connection."""
import subprocess, sys

# Try psycopg2 first, fall back to pg8000
try:
    import psycopg2
    USE_PSYCOPG2 = True
except ImportError:
    USE_PSYCOPG2 = False
    try:
        import pg8000
    except ImportError:
        print("Installing pg8000...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pg8000", "-q"])
        import pg8000

env = {}
with open('.env.local') as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').replace('\\n', '')

host = env.get('POSTGRES_HOST', 'db.yzluuwabonlqkddsczka.supabase.co')
password = env.get('POSTGRES_PASSWORD')
database = env.get('POSTGRES_DATABASE', 'postgres')
user = 'postgres'
port = 5432

sql_statements = [
    "ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tx_hash TEXT",
    "ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description TEXT",
    "CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON public.transactions (tx_hash) WHERE tx_hash IS NOT NULL",
]

print(f"Connecting to {host}:{port}/{database}...")

if USE_PSYCOPG2:
    conn = psycopg2.connect(host=host, port=port, dbname=database, user=user, password=password, sslmode='require')
    conn.autocommit = True
    cur = conn.cursor()
    for sql in sql_statements:
        print(f"  Running: {sql[:70]}...")
        cur.execute(sql)
        print(f"  OK")
    cur.close()
    conn.close()
else:
    conn = pg8000.connect(host=host, port=port, database=database, user=user, password=password, ssl_context=True)
    conn.autocommit = True
    cur = conn.cursor()
    for sql in sql_statements:
        print(f"  Running: {sql[:70]}...")
        cur.execute(sql)
        print(f"  OK")
    cur.close()
    conn.close()

print("\nMigration complete! tx_hash and description columns added to transactions table.")
