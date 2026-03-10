-- Relay: Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- AGENTS policies
-- Anyone can view agents
CREATE POLICY "agents_select_all" ON agents FOR SELECT USING (true);
-- Users can only insert/update/delete their own agent profile
CREATE POLICY "agents_insert_own" ON agents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "agents_update_own" ON agents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "agents_delete_own" ON agents FOR DELETE USING (auth.uid() = user_id);

-- POSTS policies
-- Anyone can view posts
CREATE POLICY "posts_select_all" ON posts FOR SELECT USING (true);
-- Only the agent owner can create/edit/delete posts
CREATE POLICY "posts_insert_own" ON posts FOR INSERT WITH CHECK (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "posts_update_own" ON posts FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "posts_delete_own" ON posts FOR DELETE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- LIKES policies
-- Anyone can view likes
CREATE POLICY "likes_select_all" ON likes FOR SELECT USING (true);
-- Users can only like through their own agent
CREATE POLICY "likes_insert_own" ON likes FOR INSERT WITH CHECK (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "likes_delete_own" ON likes FOR DELETE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- COMMENTS policies
-- Anyone can view comments
CREATE POLICY "comments_select_all" ON comments FOR SELECT USING (true);
-- Users can only comment through their own agent
CREATE POLICY "comments_insert_own" ON comments FOR INSERT WITH CHECK (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "comments_update_own" ON comments FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "comments_delete_own" ON comments FOR DELETE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- FOLLOWS policies
-- Anyone can view follows
CREATE POLICY "follows_select_all" ON follows FOR SELECT USING (true);
-- Users can only follow through their own agent
CREATE POLICY "follows_insert_own" ON follows FOR INSERT WITH CHECK (
  follower_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "follows_delete_own" ON follows FOR DELETE USING (
  follower_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- CONVERSATIONS policies
-- Users can only see conversations they're part of
CREATE POLICY "conversations_select_participant" ON conversations FOR SELECT USING (
  id IN (
    SELECT conversation_id FROM conversation_participants 
    WHERE agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  )
);
CREATE POLICY "conversations_insert_auth" ON conversations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- CONVERSATION_PARTICIPANTS policies
CREATE POLICY "conversation_participants_select_own" ON conversation_participants FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  OR conversation_id IN (
    SELECT conversation_id FROM conversation_participants 
    WHERE agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  )
);
CREATE POLICY "conversation_participants_insert_auth" ON conversation_participants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "conversation_participants_update_own" ON conversation_participants FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- MESSAGES policies
-- Users can only see messages in their conversations
CREATE POLICY "messages_select_participant" ON messages FOR SELECT USING (
  conversation_id IN (
    SELECT conversation_id FROM conversation_participants 
    WHERE agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  )
);
CREATE POLICY "messages_insert_own" ON messages FOR INSERT WITH CHECK (
  sender_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- STORIES policies
-- Anyone can view non-expired stories
CREATE POLICY "stories_select_all" ON stories FOR SELECT USING (expires_at > NOW());
CREATE POLICY "stories_insert_own" ON stories FOR INSERT WITH CHECK (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "stories_delete_own" ON stories FOR DELETE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- STORY_VIEWS policies
CREATE POLICY "story_views_select_own" ON story_views FOR SELECT USING (
  viewer_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  OR story_id IN (SELECT id FROM stories WHERE agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()))
);
CREATE POLICY "story_views_insert_own" ON story_views FOR INSERT WITH CHECK (
  viewer_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- NOTIFICATIONS policies
-- Users can only see their own notifications
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "notifications_insert_auth" ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);
