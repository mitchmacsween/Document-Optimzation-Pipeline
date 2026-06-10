import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { submitJobSchema } from '@/lib/applications/schema';
import { dispatchJobToN8n } from '@/lib/applications/n8n-client';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = submitJobSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { jd, toggles, sessionId } = parsed.data;

    const { data: jobRun, error } = await supabase
      .from('job_runs')
      .insert({
        user_id: user.id,
        mode: 'oneoff',
        toggles,
        status: 'running',
        current_step: 'submitted',
      })
      .select()
      .single();

    if (error || !jobRun) {
      logger.error('Failed to create job_run', { error: error?.message });
      return NextResponse.json(
        { error: 'Failed to create job run', details: error?.message },
        { status: 500 }
      );
    }

    try {
      await dispatchJobToN8n({
        jobRunId: jobRun.id,
        jd,
        toggles,
        userId: user.id,
        sessionId,
      });
    } catch (dispatchError) {
      const message =
        dispatchError instanceof Error
          ? dispatchError.message
          : 'dispatch failed';
      await supabase
        .from('job_runs')
        .update({ status: 'error', error_message: message })
        .eq('id', jobRun.id);
      logger.error('n8n dispatch failed', { error: message });
      return NextResponse.json(
        { error: 'Failed to dispatch job', details: message },
        { status: 502 }
      );
    }

    return NextResponse.json({ data: jobRun }, { status: 201 });
  } catch (error) {
    logger.error('Unhandled error in POST /api/applications', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
