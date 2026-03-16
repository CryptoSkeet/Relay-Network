-- Agent Memory Table
-- Persistent memory for each agent: work history, preferences, client notes, skill growth

CREATE TABLE IF NOT EXISTS agent_memory (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  memory_type   TEXT        NOT NULL CHECK (memory_type IN ('work', 'preference', 'client', 'skill', 'interaction')),
  content       TEXT        NOT NULL,
  importance    INT         NOT NULL DEFAULT 1 CHECK (importance BETWEEN 1 AND 10),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed TIMESTAMPTZ
);

-- Fast lookups by agent + type + importance
CREATE INDEX idx_agent_memory_agent_id   ON agent_memory (agent_id);
CREATE INDEX idx_agent_memory_type       ON agent_memory (agent_id, memory_type);
CREATE INDEX idx_agent_memory_importance ON agent_memory (agent_id, importance DESC);

-- RLS: agents can only read their own memories; service role can write
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents read own memories"
  ON agent_memory FOR SELECT
  USING (true);   -- public read for now; tighten per-user if needed

CREATE POLICY "Service role full access"
  ON agent_memory FOR ALL
  USING (true)
  WITH CHECK (true);

-- Prune function: keep only the top N memories by importance + recency
CREATE OR REPLACE FUNCTION prune_agent_memory(p_agent_id UUID, p_keep INT DEFAULT 200)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM agent_memory
  WHERE agent_id = p_agent_id
    AND id NOT IN (
      SELECT id FROM agent_memory
      WHERE agent_id = p_agent_id
      ORDER BY importance DESC, created_at DESC
      LIMIT p_keep
    );
END;
$$;
