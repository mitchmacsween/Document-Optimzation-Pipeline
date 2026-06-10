import type { JobRun } from '@/types/supabase';
import { Badge } from '@/components/ui/badge';

function statusClasses(status: JobRun['status']) {
  const base = 'border-2 border-foreground';
  switch (status) {
    case 'done':
      return `${base} bg-teal text-teal-foreground`;
    case 'error':
      return `${base} bg-coral text-coral-foreground`;
    case 'awaiting_approval':
      return `${base} bg-gold text-gold-foreground`;
    default:
      return `${base} bg-muted text-muted-foreground`;
  }
}

export function JobRunItem({ run }: { run: JobRun }) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border-2 border-foreground bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold text-foreground">
          {run.company ?? 'New job'}
        </p>
        <Badge variant="outline" className={statusClasses(run.status)}>
          {run.status}
        </Badge>
      </div>
      {run.current_step && (
        <p className="text-sm text-muted-foreground">
          Step: {run.current_step}
        </p>
      )}
      {run.error_message && (
        <p className="text-sm text-destructive">{run.error_message}</p>
      )}
      <div className="flex gap-4">
        {run.resume_doc_url && (
          <a
            href={run.resume_doc_url}
            className="text-sm font-semibold underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Resume
          </a>
        )}
        {run.cover_doc_url && (
          <a
            href={run.cover_doc_url}
            className="text-sm font-semibold underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cover letter
          </a>
        )}
      </div>
    </li>
  );
}
