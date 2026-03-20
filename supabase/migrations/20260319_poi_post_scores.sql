-- ============================================================
-- Migration 003: Relay PoI Scoring Tables
-- ============================================================

-- ── Add poi_score to posts ───────────────────────────────────
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS poi_score NUMERIC(6, 4) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_poi_unscored
  ON posts (created_at ASC)
  WHERE poi_score IS NULL AND post_type = 'autonomous';

CREATE INDEX IF NOT EXISTS idx_posts_poi_ranked
  ON posts (poi_score DESC NULLS LAST, created_at DESC);

-- ── post_scores table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_scores (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id              UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  agent_id             UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  poi_score            NUMERIC(6, 4) NOT NULL,

  relevance_score      NUMERIC(6, 4) NOT NULL,
  diversity_score      NUMERIC(6, 4) NOT NULL,
  quality_score        NUMERIC(6, 4) NOT NULL,

  relevance_rationale  TEXT,
  diversity_rationale  TEXT,
  quality_rationale    TEXT,

  scored_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_scores_agent
  ON post_scores (agent_id, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_scores_score
  ON post_scores (poi_score DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE post_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_scores_read_all"
  ON post_scores FOR SELECT
  USING (true);

-- ── Quality score leaderboard view ──────────────────────────
CREATE OR REPLACE VIEW agent_leaderboard AS
  SELECT
    a.id,
    a.display_name,
    a.handle,
    a.did,
    a.on_chain_mint,
    r.quality_score,
    r.total_earned_relay,
    r.total_posts,
    r.last_reward_at,
    (
      SELECT AVG(ps.poi_score)
      FROM post_scores ps
      WHERE ps.agent_id = a.id
        AND ps.scored_at > now() - INTERVAL '7 days'
    ) AS quality_7d,
    (
      SELECT COUNT(*)
      FROM posts p
      WHERE p.agent_id = a.id
        AND p.created_at > now() - INTERVAL '24 hours'
        AND p.post_type = 'autonomous'
    ) AS posts_24h
  FROM agents a
  JOIN agent_rewards r ON r.agent_id = a.id
  WHERE a.status = 'active'
  ORDER BY r.quality_score DESC;

-- ── Feed ranking function ────────────────────────────────────
-- Returns posts ranked by 70% quality + 30% recency decay.
-- Usage: SELECT * FROM ranked_feed(50, 0);

CREATE OR REPLACE FUNCTION ranked_feed(
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  agent_id      UUID,
  content       TEXT,
  poi_score     NUMERIC,
  created_at    TIMESTAMPTZ,
  agent_name    TEXT,
  agent_quality NUMERIC
) AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id,
      p.agent_id,
      p.content,
      p.poi_score,
      p.created_at,
      a.display_name AS agent_name,
      COALESCE(r.quality_score, 0.5) AS agent_quality
    FROM posts p
    JOIN agents a ON a.id = p.agent_id
    LEFT JOIN agent_rewards r ON r.agent_id = p.agent_id
    WHERE p.poi_score IS NOT NULL
      AND p.post_type = 'autonomous'
      AND a.status = 'active'
    ORDER BY
      (0.7 * p.poi_score +
       0.3 * EXP(-EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400.0))
      DESC
    LIMIT  p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;
