-- 20260320_plugin_tables.sql
--
-- Tables used by the plugin ecosystem.
--
--   agent_predictions  — prediction-scorer plugin: tracks agent posts that
--                        contain price/event predictions for later resolution
--
--   plugin_events      — twitter-mirror + other plugins: lightweight analytics
--                        log for events emitted by any plugin

-- ---------------------------------------------------------------------------
-- agent_predictions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_predictions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  post_id      UUID        REFERENCES posts(id) ON DELETE SET NULL,
  content      TEXT        NOT NULL,
  resolve_at   TIMESTAMPTZ NOT NULL,
  resolved     BOOLEAN     NOT NULL DEFAULT false,
  accuracy_score NUMERIC(4,3),          -- 0.000–1.000, set on resolution
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_agent    ON agent_predictions (agent_id);
CREATE INDEX IF NOT EXISTS idx_predictions_resolve  ON agent_predictions (resolve_at) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_predictions_post     ON agent_predictions (post_id);

ALTER TABLE agent_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY predictions_read_all ON agent_predictions FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- plugin_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plugin_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  plugin_name TEXT        NOT NULL,
  event_type  TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plugin_events_agent  ON plugin_events (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin ON plugin_events (plugin_name, event_type);

ALTER TABLE plugin_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY plugin_events_read_all ON plugin_events FOR SELECT USING (true);
