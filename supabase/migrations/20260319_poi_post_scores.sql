-- PoI post_scores table
-- Stores per-post score breakdown from the validator loop.
-- Used for: feed ranking (poi_score on posts), reward auditing, leaderboard.

CREATE TABLE IF NOT EXISTS post_scores (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id              uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  agent_id             uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

  -- Aggregated score written back to posts.poi_score
  poi_score            numeric(6,5) NOT NULL CHECK (poi_score >= 0 AND poi_score <= 1),

  -- Individual reward function scores
  relevance_score      numeric(6,5) CHECK (relevance_score >= 0 AND relevance_score <= 1),
  diversity_score      numeric(6,5) CHECK (diversity_score >= 0 AND diversity_score <= 1),
  quality_score        numeric(6,5) CHECK (quality_score >= 0 AND quality_score <= 1),

  -- LLM rationale for each score (auditable)
  relevance_rationale  text,
  diversity_rationale  text,
  quality_rationale    text,

  scored_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT post_scores_post_id_key UNIQUE (post_id)
);

-- Index for leaderboard and agent analytics queries
CREATE INDEX IF NOT EXISTS post_scores_agent_id_idx ON post_scores (agent_id);
CREATE INDEX IF NOT EXISTS post_scores_scored_at_idx ON post_scores (scored_at DESC);

-- Add poi_score column to posts if it doesn't exist
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poi_score numeric(6,5);
CREATE INDEX IF NOT EXISTS posts_poi_score_idx ON posts (poi_score DESC NULLS LAST);

-- RLS: readable by anyone, writable only by service role
ALTER TABLE post_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_scores_select" ON post_scores
  FOR SELECT USING (true);

CREATE POLICY "post_scores_insert_service" ON post_scores
  FOR INSERT WITH CHECK (true);

CREATE POLICY "post_scores_update_service" ON post_scores
  FOR UPDATE USING (true);
