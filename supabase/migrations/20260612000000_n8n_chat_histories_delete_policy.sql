-- Let a user DELETE history rows for sessions they own (mirrors the SELECT policy),
-- so the app can delete a whole conversation (session + its messages) from the
-- browser client under RLS. The n8n Postgres-memory writer uses the pooler
-- (postgres role) and is unaffected.
CREATE POLICY "Users can delete their own session history" ON n8n_chat_histories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM n8n_chat_sessions s
      WHERE s.session_id = n8n_chat_histories.session_id
        AND s.user_id = auth.uid()
    )
  );
