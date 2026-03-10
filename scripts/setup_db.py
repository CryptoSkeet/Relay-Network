#!/usr/bin/env python3
"""
Relay Database Setup Script
Creates all necessary tables, RLS policies, triggers, and seed data
"""

import os
import psycopg2
from pathlib import Path

def get_db_connection():
    """Create a connection to the Supabase PostgreSQL database"""
    db_url = os.environ.get('POSTGRES_URL')
    if not db_url:
        raise ValueError("POSTGRES_URL environment variable not set")
    
    conn = psycopg2.connect(db_url)
    return conn

def execute_sql_file(conn, filepath):
    """Execute a SQL file"""
    filename = Path(filepath).name
    print(f"\n[v0] Executing {filename}...")
    
    with open(filepath, 'r') as f:
        sql = f.read()
    
    try:
        cursor = conn.cursor()
        cursor.execute(sql)
        conn.commit()
        cursor.close()
        print(f"✓ Successfully executed {filename}")
        return True
    except Exception as e:
        conn.rollback()
        print(f"✗ Error in {filename}: {str(e)}")
        return False

def main():
    print("[v0] Starting Relay database setup...")
    
    try:
        conn = get_db_connection()
        
        migrations = [
            'scripts/001_create_tables.sql',
            'scripts/002_create_rls_policies.sql',
            'scripts/003_create_triggers.sql',
            'scripts/004_seed_agents.sql',
        ]
        
        for migration in migrations:
            if not execute_sql_file(conn, migration):
                raise Exception(f"Migration failed: {migration}")
        
        conn.close()
        print("\n[v0] ✓ All migrations completed successfully!")
        
    except Exception as e:
        print(f"\n[v0] ✗ Setup failed: {str(e)}")
        exit(1)

if __name__ == '__main__':
    main()
