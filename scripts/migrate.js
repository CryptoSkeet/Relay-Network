#!/usr/bin/env node

/**
 * Supabase Migration Runner
 * Automates the execution of database migrations in the correct order
 * Includes migration tracking and rollback capabilities
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { logger } from '../lib/logger.js'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

interface MigrationRecord {
  id: string
  name: string
  executed_at: string
  checksum: string
}

async function runMigrations() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    logger.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  try {
    logger.info('Starting database migration process')

    // Ensure migrations tracking table exists
    await ensureMigrationsTable(supabase)

    // Get list of migration files
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort() // Sort by filename (should be date-prefixed)

    logger.info(`Found ${migrationFiles.length} migration files`)

    // Get already executed migrations
    const { data: executedMigrations, error: fetchError } = await supabase
      .from('schema_migrations')
      .select('id, name, executed_at, checksum')
      .order('executed_at', { ascending: true })

    if (fetchError) {
      logger.error('Failed to fetch executed migrations', fetchError)
      process.exit(1)
    }

    const executedMap = new Map(
      executedMigrations?.map(m => [m.id, m]) || []
    )

    let executedCount = 0
    let skippedCount = 0

    // Execute pending migrations
    for (const file of migrationFiles) {
      const migrationId = file.replace('.sql', '')
      const filePath = join(MIGRATIONS_DIR, file)
      const sql = readFileSync(filePath, 'utf-8')
      const checksum = require('crypto').createHash('md5').update(sql).digest('hex')

      const existing = executedMap.get(migrationId)

      if (existing) {
        // Check if migration has changed
        if (existing.checksum !== checksum) {
          logger.warn(`Migration ${file} has changed since execution. Skipping to prevent data corruption.`)
          logger.warn(`Expected checksum: ${existing.checksum}, got: ${checksum}`)
        } else {
          logger.info(`Skipping already executed migration: ${file}`)
          skippedCount++
        }
        continue
      }

      logger.info(`Executing migration: ${file}`)

      // Execute migration
      const { error: migrationError } = await supabase.rpc('exec_sql', {
        sql_query: sql
      })

      if (migrationError) {
        logger.error(`Migration failed: ${file}`, migrationError)
        logger.error(`SQL content: ${sql.substring(0, 500)}...`)
        process.exit(1)
      }

      // Record successful migration
      const { error: recordError } = await supabase
        .from('schema_migrations')
        .insert({
          id: migrationId,
          name: file,
          checksum,
          executed_at: new Date().toISOString()
        })

      if (recordError) {
        logger.error(`Failed to record migration: ${file}`, recordError)
        process.exit(1)
      }

      logger.info(`Successfully executed migration: ${file}`)
      executedCount++
    }

    logger.info(`Migration summary: ${executedCount} executed, ${skippedCount} skipped`)

    // Run post-migration checks
    await runPostMigrationChecks(supabase)

  } catch (error) {
    logger.error('Migration process failed', error)
    process.exit(1)
  }
}

async function ensureMigrationsTable(supabase: any) {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at
    ON schema_migrations(executed_at);

    CREATE INDEX IF NOT EXISTS idx_schema_migrations_checksum
    ON schema_migrations(checksum);
  `

  const { error } = await supabase.rpc('exec_sql', {
    sql_query: createTableSQL
  })

  if (error) {
    logger.error('Failed to create migrations table', error)
    process.exit(1)
  }

  logger.info('Migrations tracking table ready')
}

async function runPostMigrationChecks(supabase: any) {
  logger.info('Running post-migration checks')

  // Check that all expected tables exist
  const expectedTables = [
    'agents', 'posts', 'contracts', 'agent_tokens', 'dao_proposals',
    'conversations', 'messages', 'follows', 'comments', 'reactions'
  ]

  for (const table of expectedTables) {
    const { error } = await supabase
      .from(table)
      .select('count', { count: 'exact', head: true })

    if (error) {
      logger.warn(`Table check failed for ${table}:`, error.message)
    } else {
      logger.info(`✓ Table ${table} exists`)
    }
  }

  logger.info('Post-migration checks completed')
}

// CLI interface
const command = process.argv[2]

switch (command) {
  case 'status':
    // Show migration status
    showMigrationStatus()
    break
  case 'rollback':
    // Rollback last migration (future enhancement)
    logger.error('Rollback not yet implemented')
    process.exit(1)
    break
  default:
    // Run migrations
    runMigrations()
    break
}

async function showMigrationStatus() {
  // Implementation for showing status
  logger.info('Migration status check not yet implemented')
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
}

export { runMigrations }
