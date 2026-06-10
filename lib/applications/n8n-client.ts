import { logger } from '@/lib/logger';
import type { Toggles } from './schema';

export interface DispatchJobParams {
  jobRunId: string;
  jd: string;
  toggles: Toggles;
  userId: string;
  sessionId: string;
}

/**
 * POST a one-off job to the Job Application Manager v3 n8n webhook. Server-only
 * (reads N8N_JOBMANAGER_* env). The webhook is configured to respond
 * immediately; progress is reported back via the job_runs table, not this call.
 * When the URL is unset the call is a graceful no-op (placeholder mode).
 */
export async function dispatchJobToN8n(
  params: DispatchJobParams
): Promise<void> {
  const url = process.env.N8N_JOBMANAGER_WEBHOOK_URL;
  if (!url) {
    logger.warn('N8N_JOBMANAGER_WEBHOOK_URL unset; skipping n8n dispatch');
    return;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.N8N_JOBMANAGER_WEBHOOK_SECRET
        ? { API_KEY: process.env.N8N_JOBMANAGER_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify({
      mode: 'oneoff',
      jobRunId: params.jobRunId,
      jd: params.jd,
      toggles: params.toggles,
      userId: params.userId,
      sessionId: params.sessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(`n8n dispatch failed: ${response.status}`);
  }
}
