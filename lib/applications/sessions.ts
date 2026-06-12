import { createClient } from '@/lib/supabase/client';

/**
 * Delete a conversation and its messages. RLS scopes both deletes to the
 * signed-in user, so a user can only ever delete their own. Deletes history
 * rows first, then the session row.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('n8n_chat_histories')
    .delete()
    .eq('session_id', sessionId);
  await supabase.from('n8n_chat_sessions').delete().eq('session_id', sessionId);
}
