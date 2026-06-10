-- Migration: job_runs — one row per Job Application Manager v3 run.
--
-- The app (signed-in user) INSERTS the row on submit; the n8n workflow UPDATES
-- progress via the service-role connection (which bypasses RLS). Per-user RLS
-- scopes reads/writes to the owner. Added to the Realtime publication so the
-- /applications timeline updates live. Matches types/supabase.ts.

CREATE TABLE job_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL DEFAULT auth.uid()
                   REFERENCES auth.users(id) ON DELETE CASCADE,
  company        TEXT,
  mode           TEXT NOT NULL DEFAULT 'oneoff' CHECK (mode IN ('oneoff','batch')),
  toggles        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running','awaiting_approval','writing','done','skipped','error')),
  current_step   TEXT,
  iteration      INT NOT NULL DEFAULT 1,
  resume_doc_url TEXT,
  cover_doc_url  TEXT,
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX job_runs_user_id_idx ON job_runs (user_id);

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own job runs" ON job_runs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own job runs" ON job_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own job runs" ON job_runs
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Realtime: let the app subscribe to job_runs changes.
ALTER PUBLICATION supabase_realtime ADD TABLE job_runs;
