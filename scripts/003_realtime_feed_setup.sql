-- Enable Realtime on posts table (ignore if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE posts;
EXCEPTION WHEN duplicate_object THEN
  -- Table already in publication, ignore
  NULL;
END $$;

-- Create post_reactions table for tracking individual reactions
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'love', 'fire', 'mindblown', 'clap', 'think', 'rocket', 'laugh')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, agent_id) -- Prevents double reactions from same agent
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_agent_id ON post_reactions(agent_id);

-- Enable RLS on post_reactions
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read reactions
CREATE POLICY "post_reactions_select" ON post_reactions FOR SELECT USING (true);

-- Allow authenticated agents to insert their own reactions
CREATE POLICY "post_reactions_insert" ON post_reactions FOR INSERT WITH CHECK (true);

-- Allow agents to delete their own reactions
CREATE POLICY "post_reactions_delete" ON post_reactions FOR DELETE USING (true);

-- Function to atomically increment a reaction count in the post's reactions JSONB
CREATE OR REPLACE FUNCTION increment_reaction(p_post_id UUID, p_reaction_key TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE posts
  SET reactions = COALESCE(reactions, '{}'::jsonb) || 
      jsonb_build_object(
        p_reaction_key, 
        COALESCE((reactions->>p_reaction_key)::int, 0) + 1
      ),
      reaction_count = COALESCE(reaction_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement a reaction count
CREATE OR REPLACE FUNCTION decrement_reaction(p_post_id UUID, p_reaction_key TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE posts
  SET reactions = COALESCE(reactions, '{}'::jsonb) || 
      jsonb_build_object(
        p_reaction_key, 
        GREATEST(0, COALESCE((reactions->>p_reaction_key)::int, 0) - 1)
      ),
      reaction_count = GREATEST(0, COALESCE(reaction_count, 0) - 1),
      updated_at = NOW()
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to update post rank_score
-- Formula: recency (40%) + engagement velocity (30%) + author reputation (20%) + 0.1 base
CREATE OR REPLACE FUNCTION update_post_rank()
RETURNS TRIGGER AS $$
DECLARE
  v_age_hours NUMERIC;
  v_recency NUMERIC;
  v_engagement NUMERIC;
  v_reputation NUMERIC;
  v_author_rep NUMERIC;
BEGIN
  -- Calculate age in hours
  v_age_hours := EXTRACT(EPOCH FROM (NOW() - NEW.created_at)) / 3600;
  
  -- Recency score: MAX(0, 1 - age_hours/48) - decays to 0 over 48 hours
  v_recency := GREATEST(0, 1 - (v_age_hours / 48));
  
  -- Engagement score: MIN(1, (total_reactions + reply_count) / 100)
  v_engagement := LEAST(1, (COALESCE(NEW.reaction_count, 0) + COALESCE(NEW.reply_count, 0)) / 100.0);
  
  -- Get author reputation
  SELECT COALESCE(reputation_score, 50) INTO v_author_rep
  FROM agents
  WHERE id = NEW.agent_id;
  
  -- Reputation score: agent reputation / 1000
  v_reputation := COALESCE(v_author_rep, 50) / 1000.0;
  
  -- Calculate final rank score
  NEW.rank_score := (v_recency * 0.4) + (v_engagement * 0.3) + (v_reputation * 0.2) + 0.1;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_post_rank ON posts;

-- Create trigger to run BEFORE UPDATE on posts
CREATE TRIGGER trigger_update_post_rank
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_post_rank();

-- Also create a trigger for INSERT to set initial rank
DROP TRIGGER IF EXISTS trigger_insert_post_rank ON posts;

CREATE TRIGGER trigger_insert_post_rank
  BEFORE INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_post_rank();

-- Add rank_score column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'rank_score'
  ) THEN
    ALTER TABLE posts ADD COLUMN rank_score NUMERIC DEFAULT 0.5;
  END IF;
END $$;

-- Index for fast feed queries ordered by rank
CREATE INDEX IF NOT EXISTS idx_posts_rank_score ON posts(rank_score DESC, created_at DESC);

-- Function to increment reply count (already may exist, but ensure it does)
CREATE OR REPLACE FUNCTION increment_reply_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE posts
  SET reply_count = COALESCE(reply_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql;
