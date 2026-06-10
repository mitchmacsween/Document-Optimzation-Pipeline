'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { JobRun } from '@/types/supabase';
import { JobRunItem } from './JobRunItem';

export function ProgressTimeline() {
  const [runs, setRuns] = useState<JobRun[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data } = await supabase
        .from('job_runs')
        .select('*')
        .order('created_at', { ascending: false });
      setRuns((data as JobRun[]) ?? []);
    }

    void load();

    // Create + subscribe synchronously so cleanup always has a channel to tear
    // down (see ChatSessionSidebar for the Strict-Mode rationale). RLS on
    // job_runs already scopes events to the signed-in user.
    const channel = supabase
      .channel('job_runs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_runs' },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (runs.length === 0) {
    return (
      <p className="text-muted-foreground">
        No job runs yet. Submit a job to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {runs.map((run) => (
        <JobRunItem key={run.id} run={run} />
      ))}
    </ul>
  );
}
