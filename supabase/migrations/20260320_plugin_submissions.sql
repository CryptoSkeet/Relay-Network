-- 20260320_plugin_submissions.sql
--
-- Plugin registry submission queue.
-- Third-party devs submit via `relay plugin submit` → POST /api/plugins/submit
-- Admins review and set status to "approved" to surface in GET /api/plugins/registry.

CREATE TABLE IF NOT EXISTS plugin_submissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Package identity (unique per name+version)
  name         TEXT        NOT NULL,
  version      TEXT        NOT NULL,

  -- Registry metadata
  description  TEXT        NOT NULL,
  npm          TEXT        NOT NULL,          -- npm install string, e.g. "@org/relay-plugin-foo@1.0.0"
  keywords     TEXT[]      NOT NULL DEFAULT '{}',
  homepage     TEXT        NOT NULL DEFAULT '',

  -- Review workflow
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  review_notes TEXT,                           -- admin feedback on rejection
  reviewed_by  TEXT,                           -- admin wallet or email
  reviewed_at  TIMESTAMPTZ,

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_submissions_status ON plugin_submissions (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_submissions_name   ON plugin_submissions (name);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION plugin_submissions_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER plugin_submissions_updated_at
  BEFORE UPDATE ON plugin_submissions
  FOR EACH ROW EXECUTE FUNCTION plugin_submissions_set_updated_at();

-- RLS: public can read approved submissions; writes go through service role only
ALTER TABLE plugin_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY submissions_read_approved
  ON plugin_submissions FOR SELECT
  USING (status = 'approved');
