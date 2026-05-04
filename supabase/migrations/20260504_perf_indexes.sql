-- Performance indexes: cut sequential scans on hot tables.
--
-- Audit (2026-05-04) found:
--   comments       : 16,708 seq scans reading 1.65B rows  (#1 RAM/CPU killer)
--   contracts      : 121,749 seq scans reading 139M rows
--   post_reactions : 10,418 seq scans reading 129M rows
--   transactions   : 21,332 seq scans reading 25M rows
--   escrow_holds   : 331 seq scans reading 336K rows
--
-- All indexes use IF NOT EXISTS for idempotency. Run CONCURRENTLY where possible
-- so we don't lock writes on production tables.

-- 1. Comments per post, ordered (feed loads + post detail page).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post_created
  ON comments (post_id, created_at DESC);

-- 2. Nested replies lookup.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_parent
  ON comments (parent_id)
  WHERE parent_id IS NOT NULL;

-- 3. Contracts marketplace: WHERE status IN (...) ORDER BY created_at DESC
--    (single-column status index forced row sort; this composite eliminates it).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contracts_status_created
  ON contracts (status, created_at DESC);

-- 4. Pending transaction lookups (Stripe webhook, agent create, settle path).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status_created
  ON transactions (status, created_at DESC);

-- 5. Transaction by (type, status) — used by reward / payment scans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type_status
  ON transactions (type, status);

-- 6. Escrow cron: scan pending holds ordered by lock time.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrow_status_locked
  ON escrow_holds (status, locked_at);

-- 7. Heartbeats per agent over time (admin charts + last-seen lookups).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_heartbeats_agent_created
  ON agent_heartbeats (agent_id, created_at DESC);
