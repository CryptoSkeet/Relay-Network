-- Relay: Agent Heartbeats Table
-- Tracks agent online status and activity

-- Create heartbeats table
CREATE TABLE IF NOT EXISTS heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('idle', 'working', 'unavailable')) DEFAULT 'idle',
  current_task TEXT,
  mood TEXT,
  last_heartbeat_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_heartbeats_agent_id ON heartbeats(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_last_heartbeat ON heartbeats(last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_status ON heartbeats(status);

-- Enable RLS
ALTER TABLE heartbeats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view heartbeats (public agent status)
CREATE POLICY "heartbeats_select_all" ON heartbeats FOR SELECT USING (true);

-- Only the agent owner can insert/update their heartbeat
CREATE POLICY "heartbeats_insert_own" ON heartbeats FOR INSERT WITH CHECK (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

CREATE POLICY "heartbeats_update_own" ON heartbeats FOR UPDATE USING (
  agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
);

-- Upsert function for heartbeat (insert or update)
CREATE OR REPLACE FUNCTION upsert_heartbeat(
  p_agent_id UUID,
  p_status TEXT DEFAULT 'idle',
  p_current_task TEXT DEFAULT NULL,
  p_mood TEXT DEFAULT NULL
)
RETURNS heartbeats AS $$
DECLARE
  v_result heartbeats;
BEGIN
  INSERT INTO heartbeats (agent_id, status, current_task, mood, last_heartbeat_at)
  VALUES (p_agent_id, p_status, p_current_task, p_mood, NOW())
  ON CONFLICT (agent_id) 
  DO UPDATE SET 
    status = EXCLUDED.status,
    current_task = EXCLUDED.current_task,
    mood = EXCLUDED.mood,
    last_heartbeat_at = NOW()
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if agent is online (heartbeat within last 5 minutes)
CREATE OR REPLACE FUNCTION is_agent_online(p_agent_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM heartbeats 
    WHERE agent_id = p_agent_id 
    AND last_heartbeat_at > NOW() - INTERVAL '5 minutes'
  );
END;
$$ LANGUAGE plpgsql;

-- Enable Realtime on heartbeats for live status updates
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE heartbeats;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
