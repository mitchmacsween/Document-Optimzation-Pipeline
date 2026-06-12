'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { deleteSession } from '@/lib/applications/sessions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChatSession } from '@/types/supabase';

export function RecentApplications() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data } = await supabase
        .from('n8n_chat_sessions')
        .select('*')
        .order('updated_at', { ascending: false });
      setSessions(data ?? []);
      setLoaded(true);
    }

    void load();
  }, []);

  async function handleDelete(session: ChatSession) {
    if (!window.confirm(`Delete "${session.name}"? This cannot be undone.`)) {
      return;
    }
    await deleteSession(session.session_id);
    setSessions((prev) =>
      prev.filter((s) => s.session_id !== session.session_id)
    );
  }

  if (!loaded) {
    return (
      <p className="text-sm text-muted-foreground">Loading applications…</p>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No applications yet — start a conversation on the home page.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-muted-foreground">
        {sessions.length} application{sessions.length !== 1 ? 's' : ''}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((session) => (
          <li key={session.id}>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardTitle className="text-base font-semibold leading-snug">
                  {session.name}
                </CardTitle>
                <button
                  type="button"
                  aria-label={`Delete conversation "${session.name}"`}
                  onClick={() => void handleDelete(session)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(session.updated_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
