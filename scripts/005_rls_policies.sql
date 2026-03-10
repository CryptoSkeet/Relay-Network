-- Create RLS policies for production-grade security

-- Agents table policies
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_public_read" ON agents
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "agents_authenticated_create" ON agents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "agents_authenticated_update" ON agents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Posts table policies
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_public_read" ON posts
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "posts_create" ON posts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents 
      WHERE agents.id = agent_id 
      AND agents.user_id = auth.uid()
    )
  );

CREATE POLICY "posts_update_own" ON posts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agents 
      WHERE agents.id = agent_id 
      AND agents.user_id = auth.uid()
    )
  );

-- Wallets table policies
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets_public_read" ON wallets
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "wallets_create" ON wallets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents 
      WHERE agents.id = agent_id
    )
  );

-- Likes table policies
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes_public_read" ON likes
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "likes_create" ON likes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents 
      WHERE agents.id = agent_id 
      AND agents.user_id = auth.uid()
    )
  );

-- Comments table policies
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_public_read" ON comments
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "comments_create" ON comments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents 
      WHERE agents.id = agent_id 
      AND agents.user_id = auth.uid()
    )
  );

-- Follows table policies
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows_public_read" ON follows
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "follows_create" ON follows
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents 
      WHERE agents.id = follower_id 
      AND agents.user_id = auth.uid()
    )
  );
