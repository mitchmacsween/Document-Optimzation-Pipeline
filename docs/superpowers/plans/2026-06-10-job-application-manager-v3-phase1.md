# Job Application Manager v3 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new "Job Application Manager v3" entry point — a `/applications` page that submits a one-off job to a NEW deterministic n8n workflow and shows live per-run progress via Supabase Realtime. No human-approval gate yet (auto-proceeds through the agents).

**Architecture:** The browser form POSTs to a Next.js server route, which inserts a `job_runs` row (as the signed-in user, RLS-scoped) and forwards the job to an n8n webhook (Header Auth `API_KEY`, responds immediately). The new n8n workflow runs Extraction → Research → Strategy → (toggled) Resume/Cover-Letter pipelines via `executeWorkflow`, updating the `job_runs` row through a Supabase service-role credential at each step. The page subscribes to `job_runs` over Realtime and renders a timeline. The existing v1 manager (`33qUUlaqM9Yq5OX6`) is left untouched.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Tailwind + shadcn/ui, `@supabase/ssr` + Supabase Realtime, Zod, Jest + React Testing Library, n8n (built via the n8n MCP SDK).

**Spec:** `docs/superpowers/specs/2026-06-10-job-application-manager-v3-design.md` (Phase 1 = "webhook contract + deterministic pipeline + job_runs table & timeline").

**Branch:** `job-application-manager-v3` (already checked out).

---

## Conventions (read once)

- **TDD is the law.** Every source module gets a failing test FIRST (the pre-commit hook `check-test-colocation.js` blocks source files in `app/`/`components/`/`lib/`/`types/` with no matching test in `tests/`). Coverage gate is **80% global** (`jest.config.js`).
- **Tests live in a centralized tree** mirroring source: `tests/unit/...` (components, lib) and `tests/integration/...` (API routes). NOT colocated.
- **300-line limit** per source file. Keep components focused.
- **Path alias** `@/...` maps to repo root (`moduleNameMapper` in `jest.config.js`).
- **Single test run while developing:** `npm test -- <path>`; full suite: `npm test`.
- **Supabase schema** is applied via the **Supabase MCP** `apply_migration` (project ref `kshutthhafzlqxmueotr`), and the migration SQL is ALSO committed under `supabase/migrations/` (source of truth).
- Do NOT hand-edit the `<!-- AUTO:* -->` sections of `CLAUDE.md` — the pre-commit hook regenerates them.

## File structure (what Phase 1 creates / modifies)

| File                                                     | Responsibility                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `supabase/migrations/20260610000000_create_job_runs.sql` | **Create.** `job_runs` table, RLS, Realtime publication.                                 |
| `types/supabase.ts`                                      | **Modify.** Add `job_runs` table types + `JobRun`/`JobRunInsert`/`JobRunUpdate` exports. |
| `.env.example`, `.env.local`                             | **Modify.** Add `N8N_JOBMANAGER_WEBHOOK_URL` / `N8N_JOBMANAGER_WEBHOOK_SECRET`.          |
| `lib/applications/schema.ts`                             | **Create.** Zod schema + types for the submit payload.                                   |
| `lib/applications/n8n-client.ts`                         | **Create.** Server-only helper that POSTs the job to the n8n webhook.                    |
| `app/api/applications/route.ts`                          | **Create.** `POST` submit handler: auth → validate → insert `job_runs` → dispatch.       |
| `app/components/applications/JobRunItem.tsx`             | **Create.** Presentational row for one job run.                                          |
| `app/components/applications/ProgressTimeline.tsx`       | **Create.** Client component; Realtime subscription + list.                              |
| `app/components/applications/JobSubmitForm.tsx`          | **Create.** Client form: JD textarea + 3 toggles + submit.                               |
| `app/applications/page.tsx`                              | **Create.** The `/applications` page (hero + form + timeline).                           |
| `app/components/Navigation.tsx`                          | **Modify.** Add the "Applications" nav link.                                             |
| n8n workflow "Job Application Manager v3"                | **Create** in n8n via MCP (Task 9).                                                      |
| `docs/integrations/n8n-jobmanager.md`                    | **Create.** The manual e2e checklist + node map for the new workflow.                    |

---

## Task 1: `job_runs` table (migration + types)

**Files:**

- Create: `supabase/migrations/20260610000000_create_job_runs.sql`
- Modify: `types/supabase.ts`

- [ ] **Step 1: Write the migration SQL file**

Create `supabase/migrations/20260610000000_create_job_runs.sql`:

```sql
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
```

- [ ] **Step 2: Apply the migration via the Supabase MCP**

Call the Supabase MCP `apply_migration` with `project_id: "kshutthhafzlqxmueotr"`, `name: "create_job_runs"`, and `query` set to the exact SQL above.
Expected: success (no error). Then call `list_tables` (schemas `["public"]`) and confirm `public.job_runs` appears with `rls_enabled: true`.

- [ ] **Step 3: Add `job_runs` types to `types/supabase.ts`**

Inside `Database['public']['Tables']`, after the `n8n_chat_histories` block, add:

```typescript
      job_runs: {
        Row: {
          id: string;
          user_id: string;
          company: string | null;
          mode: 'oneoff' | 'batch';
          toggles: Json;
          status:
            | 'running'
            | 'awaiting_approval'
            | 'writing'
            | 'done'
            | 'skipped'
            | 'error';
          current_step: string | null;
          iteration: number;
          resume_doc_url: string | null;
          cover_doc_url: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          company?: string | null;
          mode?: 'oneoff' | 'batch';
          toggles?: Json;
          status?:
            | 'running'
            | 'awaiting_approval'
            | 'writing'
            | 'done'
            | 'skipped'
            | 'error';
          current_step?: string | null;
          iteration?: number;
          resume_doc_url?: string | null;
          cover_doc_url?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company?: string | null;
          mode?: 'oneoff' | 'batch';
          toggles?: Json;
          status?:
            | 'running'
            | 'awaiting_approval'
            | 'writing'
            | 'done'
            | 'skipped'
            | 'error';
          current_step?: string | null;
          iteration?: number;
          resume_doc_url?: string | null;
          cover_doc_url?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

Then add the exported helper types near the bottom (after the `ChatSession`/`N8nChatHistory` exports):

```typescript
export type JobRun = Database['public']['Tables']['job_runs']['Row'];
export type JobRunInsert = Database['public']['Tables']['job_runs']['Insert'];
export type JobRunUpdate = Database['public']['Tables']['job_runs']['Update'];
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS (exit 0). `types/supabase.ts` is type-only, matching the repo's existing convention (no test file — same as the shipped `tasks`/`n8n_chat_sessions` types).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260610000000_create_job_runs.sql types/supabase.ts
git commit -m "feat(applications): add job_runs table + types"
```

---

## Task 2: Submit payload schema (`lib/applications/schema.ts`)

**Files:**

- Create: `lib/applications/schema.ts`
- Test: `tests/unit/lib/applications/test_schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lib/applications/test_schema.test.ts`:

```typescript
import { submitJobSchema } from '@/lib/applications/schema';

const validSession = '11111111-1111-1111-1111-111111111111';

describe('submitJobSchema', () => {
  it('accepts a valid one-off submission', () => {
    const result = submitJobSchema.safeParse({
      jd: 'We are hiring a Senior Product Manager to lead payments.',
      toggles: { research: true, resume: true, cover: false },
      sessionId: validSession,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a job description shorter than 20 characters', () => {
    const result = submitJobSchema.safeParse({
      jd: 'too short',
      toggles: { research: true, resume: false, cover: false },
      sessionId: validSession,
    });
    expect(result.success).toBe(false);
  });

  it('rejects when no toggle is selected', () => {
    const result = submitJobSchema.safeParse({
      jd: 'A sufficiently long job description for a PM role here.',
      toggles: { research: false, resume: false, cover: false },
      sessionId: validSession,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid sessionId', () => {
    const result = submitJobSchema.safeParse({
      jd: 'A sufficiently long job description for a PM role here.',
      toggles: { research: true, resume: false, cover: false },
      sessionId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/lib/applications/test_schema.test.ts`
Expected: FAIL — cannot find module `@/lib/applications/schema`.

- [ ] **Step 3: Write the schema**

Create `lib/applications/schema.ts`:

```typescript
import { z } from 'zod';

/** The three actions a job submission can request. At least one must be true. */
export const togglesSchema = z.object({
  research: z.boolean(),
  resume: z.boolean(),
  cover: z.boolean(),
});

/** Body of POST /api/applications (one-off submission). */
export const submitJobSchema = z
  .object({
    jd: z
      .string()
      .trim()
      .min(20, 'Job description must be at least 20 characters'),
    toggles: togglesSchema,
    sessionId: z.string().uuid(),
  })
  .refine((d) => d.toggles.research || d.toggles.resume || d.toggles.cover, {
    message: 'Select at least one action',
    path: ['toggles'],
  });

export type Toggles = z.infer<typeof togglesSchema>;
export type SubmitJobInput = z.infer<typeof submitJobSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/lib/applications/test_schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/applications/schema.ts tests/unit/lib/applications/test_schema.test.ts
git commit -m "feat(applications): add submit payload schema"
```

---

## Task 3: n8n dispatch helper (`lib/applications/n8n-client.ts`)

**Files:**

- Create: `lib/applications/n8n-client.ts`
- Test: `tests/unit/lib/applications/test_n8n-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lib/applications/test_n8n-client.test.ts`:

```typescript
import { dispatchJobToN8n } from '@/lib/applications/n8n-client';

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const params = {
  jobRunId: 'run-1',
  jd: 'Senior PM for payments platform, lots of detail here.',
  toggles: { research: true, resume: true, cover: false },
  userId: 'user-123',
  sessionId: '11111111-1111-1111-1111-111111111111',
};

describe('dispatchJobToN8n', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('POSTs the job with the API_KEY header when env is set', async () => {
    process.env.N8N_JOBMANAGER_WEBHOOK_URL = 'https://n8n.example/webhook/abc';
    process.env.N8N_JOBMANAGER_WEBHOOK_SECRET = 'sekret';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    await dispatchJobToN8n(params);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://n8n.example/webhook/abc');
    expect(init.method).toBe('POST');
    expect(init.headers.API_KEY).toBe('sekret');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      mode: 'oneoff',
      jobRunId: 'run-1',
      userId: 'user-123',
      toggles: { research: true, resume: true, cover: false },
    });
  });

  it('throws when the webhook responds non-OK', async () => {
    process.env.N8N_JOBMANAGER_WEBHOOK_URL = 'https://n8n.example/webhook/abc';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
    await expect(dispatchJobToN8n(params)).rejects.toThrow(
      'n8n dispatch failed: 500'
    );
  });

  it('no-ops (no fetch) when the webhook URL is unset', async () => {
    delete process.env.N8N_JOBMANAGER_WEBHOOK_URL;
    await dispatchJobToN8n(params);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/lib/applications/test_n8n-client.test.ts`
Expected: FAIL — cannot find module `@/lib/applications/n8n-client`.

- [ ] **Step 3: Write the helper**

Create `lib/applications/n8n-client.ts`:

```typescript
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
      // n8n "Header Auth" credential — header named API_KEY, value is the
      // server-side secret (never sent to the browser).
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/lib/applications/test_n8n-client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/applications/n8n-client.ts tests/unit/lib/applications/test_n8n-client.test.ts
git commit -m "feat(applications): add n8n dispatch helper"
```

---

## Task 4: Submit API route (`app/api/applications/route.ts`)

**Files:**

- Create: `app/api/applications/route.ts`
- Test: `tests/integration/api/test_applications.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/api/test_applications.test.ts`:

```typescript
import { POST } from '@/app/api/applications/route';
import { createClient } from '@/lib/supabase/server';
import { dispatchJobToN8n } from '@/lib/applications/n8n-client';

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/applications/n8n-client', () => ({
  dispatchJobToN8n: jest.fn(),
}));

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  jd: 'Senior Product Manager for payments platform, plenty of detail.',
  toggles: { research: true, resume: true, cover: false },
  sessionId: '11111111-1111-1111-1111-111111111111',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
  (createClient as jest.Mock).mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  });
});

describe('POST /api/applications', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body', async () => {
    const res = await POST(
      makeRequest({
        jd: 'short',
        toggles: { research: false, resume: false, cover: false },
        sessionId: 'x',
      })
    );
    expect(res.status).toBe(400);
  });

  it('inserts a job_run, dispatches to n8n, and returns 201 with the row', async () => {
    const jobRun = { id: 'run-1', user_id: 'user-123', status: 'running' };
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: jobRun, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ insert: mockInsert });
    (dispatchJobToN8n as jest.Mock).mockResolvedValue(undefined);

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(mockFrom).toHaveBeenCalledWith('job_runs');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        mode: 'oneoff',
        status: 'running',
      })
    );
    expect(dispatchJobToN8n).toHaveBeenCalledWith(
      expect.objectContaining({ jobRunId: 'run-1', userId: 'user-123' })
    );
    expect(res.status).toBe(201);
    expect(json).toEqual({ data: jobRun });
  });

  it('marks the run errored and returns 502 when dispatch fails', async () => {
    const jobRun = { id: 'run-1', user_id: 'user-123', status: 'running' };
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: jobRun, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    const mockEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate });
    (dispatchJobToN8n as jest.Mock).mockRejectedValue(new Error('boom'));

    const res = await POST(makeRequest(validBody));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/api/test_applications.test.ts`
Expected: FAIL — cannot find module `@/app/api/applications/route`.

- [ ] **Step 3: Write the route**

Create `app/api/applications/route.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/api/test_applications.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/applications/route.ts tests/integration/api/test_applications.test.ts
git commit -m "feat(applications): add submit API route"
```

---

## Task 5: `JobRunItem` component

**Files:**

- Create: `app/components/applications/JobRunItem.tsx`
- Test: `tests/unit/app/components/applications/test_JobRunItem.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/app/components/applications/test_JobRunItem.test.tsx`:

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { JobRunItem } from '@/app/components/applications/JobRunItem';
import type { JobRun } from '@/types/supabase';

const baseRun: JobRun = {
  id: 'run-1',
  user_id: 'user-123',
  company: 'Stripe',
  mode: 'oneoff',
  toggles: { research: true, resume: true, cover: false },
  status: 'writing',
  current_step: 'Strategy',
  iteration: 1,
  resume_doc_url: null,
  cover_doc_url: null,
  error_message: null,
  created_at: '2026-06-10T12:00:00Z',
  updated_at: '2026-06-10T12:00:00Z',
};

describe('JobRunItem', () => {
  it('shows the company, status, and current step', () => {
    render(<JobRunItem run={baseRun} />);
    expect(screen.getByText('Stripe')).toBeInTheDocument();
    expect(screen.getByText(/writing/i)).toBeInTheDocument();
    expect(screen.getByText(/Strategy/)).toBeInTheDocument();
  });

  it('renders resume and cover-letter doc links when present', () => {
    render(
      <JobRunItem
        run={{
          ...baseRun,
          status: 'done',
          resume_doc_url: 'https://docs.google.com/resume',
          cover_doc_url: 'https://docs.google.com/cover',
        }}
      />
    );
    expect(screen.getByRole('link', { name: /resume/i })).toHaveAttribute(
      'href',
      'https://docs.google.com/resume'
    );
    expect(screen.getByRole('link', { name: /cover letter/i })).toHaveAttribute(
      'href',
      'https://docs.google.com/cover'
    );
  });

  it('shows the error message when status is error', () => {
    render(
      <JobRunItem run={{ ...baseRun, status: 'error', error_message: 'extraction failed' }} />
    );
    expect(screen.getByText(/extraction failed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/app/components/applications/test_JobRunItem.test.tsx`
Expected: FAIL — cannot find module `@/app/components/applications/JobRunItem`.

- [ ] **Step 3: Write the component**

Create `app/components/applications/JobRunItem.tsx`:

```typescript
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
        <p className="text-sm text-muted-foreground">Step: {run.current_step}</p>
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/app/components/applications/test_JobRunItem.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/components/applications/JobRunItem.tsx tests/unit/app/components/applications/test_JobRunItem.test.tsx
git commit -m "feat(applications): add JobRunItem component"
```

---

## Task 6: `ProgressTimeline` component (Realtime)

**Files:**

- Create: `app/components/applications/ProgressTimeline.tsx`
- Test: `tests/unit/app/components/applications/test_ProgressTimeline.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/app/components/applications/test_ProgressTimeline.test.tsx`:

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockOrder = jest.fn();
const mockSelect = jest.fn().mockReturnValue({ order: mockOrder });
const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
const mockOn = jest.fn().mockReturnThis();
const mockSubscribe = jest.fn().mockReturnValue('channel');
const mockChannel = jest.fn().mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

import { ProgressTimeline } from '@/app/components/applications/ProgressTimeline';

beforeEach(() => {
  jest.clearAllMocks();
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({ select: mockSelect });
  mockChannel.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
  mockOn.mockReturnThis();
});

describe('ProgressTimeline', () => {
  it('shows an empty state when there are no runs', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    render(<ProgressTimeline />);
    await waitFor(() =>
      expect(screen.getByText(/no job runs yet/i)).toBeInTheDocument()
    );
  });

  it('renders job runs from the initial load', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: 'run-1',
          user_id: 'u',
          company: 'Stripe',
          mode: 'oneoff',
          toggles: {},
          status: 'running',
          current_step: 'submitted',
          iteration: 1,
          resume_doc_url: null,
          cover_doc_url: null,
          error_message: null,
          created_at: '2026-06-10T12:00:00Z',
          updated_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    render(<ProgressTimeline />);
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    expect(mockFrom).toHaveBeenCalledWith('job_runs');
    expect(mockChannel).toHaveBeenCalledWith('job_runs_changes');
    expect(mockSubscribe).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/app/components/applications/test_ProgressTimeline.test.tsx`
Expected: FAIL — cannot find module `@/app/components/applications/ProgressTimeline`.

- [ ] **Step 3: Write the component**

Create `app/components/applications/ProgressTimeline.tsx` (mirrors the Realtime pattern in `ChatSessionSidebar.tsx`):

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/app/components/applications/test_ProgressTimeline.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/components/applications/ProgressTimeline.tsx tests/unit/app/components/applications/test_ProgressTimeline.test.tsx
git commit -m "feat(applications): add ProgressTimeline with Realtime"
```

---

## Task 7: `JobSubmitForm` component

**Files:**

- Create: `app/components/applications/JobSubmitForm.tsx`
- Test: `tests/unit/app/components/applications/test_JobSubmitForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/app/components/applications/test_JobSubmitForm.test.tsx`:

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { JobSubmitForm } from '@/app/components/applications/JobSubmitForm';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: {} }) });
  // jsdom lacks crypto.randomUUID in some versions; stub it deterministically.
  Object.defineProperty(global, 'crypto', {
    value: { randomUUID: () => '11111111-1111-1111-1111-111111111111' },
    configurable: true,
  });
});

describe('JobSubmitForm', () => {
  it('disables submit until a valid JD is entered', async () => {
    render(<JobSubmitForm />);
    const button = screen.getByRole('button', { name: /generate/i });
    expect(button).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/job description/i),
      'A sufficiently long job description for a PM role.'
    );
    expect(button).toBeEnabled();
  });

  it('POSTs to /api/applications with the JD and toggles', async () => {
    render(<JobSubmitForm />);
    await userEvent.type(
      screen.getByLabelText(/job description/i),
      'A sufficiently long job description for a PM role.'
    );
    await userEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/applications');
    const body = JSON.parse(init.body);
    expect(body.jd).toContain('PM role');
    expect(body.toggles).toEqual({ research: true, resume: true, cover: false });
    expect(body.sessionId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('shows an error message when the request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });
    render(<JobSubmitForm />);
    await userEvent.type(
      screen.getByLabelText(/job description/i),
      'A sufficiently long job description for a PM role.'
    );
    await userEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/app/components/applications/test_JobSubmitForm.test.tsx`
Expected: FAIL — cannot find module `@/app/components/applications/JobSubmitForm`.

- [ ] **Step 3: Write the component**

Create `app/components/applications/JobSubmitForm.tsx` (native `<textarea>` styled with tokens — no new dependency; Checkbox/Label/Button are existing primitives):

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function JobSubmitForm() {
  const [jd, setJd] = useState('');
  const [research, setResearch] = useState(true);
  const [resume, setResume] = useState(true);
  const [cover, setCover] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasToggle = research || resume || cover;
  const canSubmit = jd.trim().length >= 20 && hasToggle && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jd,
          toggles: { research, resume, cover },
          sessionId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? 'Submit failed');
      }
      setJd('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="jd">Job description</Label>
        <textarea
          id="jd"
          value={jd}
          onChange={(event) => setJd(event.target.value)}
          rows={8}
          placeholder="Paste the full job description…"
          className="rounded-2xl border-2 border-foreground bg-background p-3 text-foreground"
        />
      </div>

      <fieldset className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <Checkbox checked={research} onCheckedChange={(v) => setResearch(v === true)} />
          Research
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={resume} onCheckedChange={(v) => setResume(v === true)} />
          Resume
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={cover} onCheckedChange={(v) => setCover(v === true)} />
          Cover letter
        </label>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={!canSubmit}>
        {submitting ? 'Submitting…' : 'Generate strategy'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/app/components/applications/test_JobSubmitForm.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/components/applications/JobSubmitForm.tsx tests/unit/app/components/applications/test_JobSubmitForm.test.tsx
git commit -m "feat(applications): add JobSubmitForm component"
```

---

## Task 8: `/applications` page + nav link

**Files:**

- Create: `app/applications/page.tsx`
- Modify: `app/components/Navigation.tsx`
- Test: `tests/unit/app/applications/test_page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/app/applications/test_page.test.tsx`:

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ProgressTimeline uses the Supabase browser client — stub it.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) }) }),
    channel: () => ({ on() { return this; }, subscribe: () => 'channel' }),
    removeChannel: jest.fn(),
  }),
}));

import ApplicationsPage from '@/app/applications/page';

describe('ApplicationsPage', () => {
  it('renders the hero title and the submit form', () => {
    render(<ApplicationsPage />);
    expect(
      screen.getByRole('heading', { name: /job application manager/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/job description/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/app/applications/test_page.test.tsx`
Expected: FAIL — cannot find module `@/app/applications/page`.

- [ ] **Step 3: Write the page**

Create `app/applications/page.tsx` (client component, mirrors `app/tasks/page.tsx` structure; route is login-gated globally by `proxy.ts`):

```typescript
'use client';

import { JobSubmitForm } from '../components/applications/JobSubmitForm';
import { ProgressTimeline } from '../components/applications/ProgressTimeline';
import { PageHero } from '../components/PageHero';
import { PageShell } from '../components/PageShell';
import { Card, CardContent } from '@/components/ui/card';

export default function ApplicationsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="n8n · Job Applications"
        title="Job Application Manager"
        subtitle="Submit a job description and watch the agents research, strategize, and draft your resume and cover letter."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="border-2 border-foreground rounded-2xl">
          <CardContent className="p-6">
            <JobSubmitForm />
          </CardContent>
        </Card>
        <Card className="border-2 border-foreground rounded-2xl">
          <CardContent className="p-6">
            <ProgressTimeline />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 4: Add the nav link**

In `app/components/Navigation.tsx`, add an entry to the `NAV_LINKS` array (after the `/chat` entry):

```typescript
  { href: '/applications', label: 'Applications' },
```

- [ ] **Step 5: Run test + type-check + lint**

Run: `npm test -- tests/unit/app/applications/test_page.test.tsx`
Expected: PASS (1 test).
Run: `npm run validate`
Expected: PASS (type-check + lint, 0 errors).

- [ ] **Step 6: Commit**

```bash
git add app/applications/page.tsx app/components/Navigation.tsx tests/unit/app/applications/test_page.test.tsx
git commit -m "feat(applications): add /applications page + nav link"
```

---

## Task 9: Build the n8n "Job Application Manager v3" workflow

This task is done through the **n8n MCP** (no app code). It creates a NEW workflow — the v1 manager (`33qUUlaqM9Yq5OX6`) stays untouched. Because n8n workflows can't be unit-tested, this task ends with a manual end-to-end checklist.

**Prerequisites (manual, in the n8n UI — do these first, they can't be done via MCP):**

1. A **Header Auth** credential named so its header is `API_KEY` (value = a secret string you choose). You'll put the same value in `.env.local` as `N8N_JOBMANAGER_WEBHOOK_SECRET` (Task 10).
2. A **Supabase** (or Postgres) credential using the **service-role** key for project `kshutthhafzlqxmueotr`, so the workflow can UPDATE `job_runs` regardless of RLS.

- [ ] **Step 1: Read the SDK reference**

Call the n8n MCP `get_sdk_reference` (sections including `guidelines` and `design`). Do not write workflow code before reading it.

- [ ] **Step 2: Discover nodes**

Call `get_suggested_nodes` for the relevant technique categories, then `search_nodes` for: `["webhook", "respond to webhook", "execute workflow", "supabase", "set", "if"]`. Call `get_node_types` for every node you'll use (note the exact parameter names — do not guess).

- [ ] **Step 3: Author the workflow code**

Build a workflow named **"Job Application Manager v3"** with this node graph:

1. **Webhook** (HTTP POST). Authentication: **Header Auth** (the `API_KEY` credential). **Respond:** _Immediately_ (so the Next.js route gets a fast ack; progress flows via `job_runs`). The body delivers `{ mode, jobRunId, jd, toggles:{research,resume,cover}, userId, sessionId }`.
2. **Set "Update: running"** → Supabase **Update row** on `job_runs` where `id = {{ $json.body.jobRunId }}`, set `status = 'running'`, `current_step = 'extracting'`. (Service-role credential.)
3. **Execute Workflow → Extraction** (`sTQ1ayaH1sMwkvfz`), input `jd_text = {{ $json.body.jd }}`. Capture output as `extraction_json`. Also UPDATE `job_runs.company` from the extracted company name when available.
4. **IF `toggles.research`** → **Execute Workflow → Research** (`88o6KsvquethsIYR`), inputs `company_name`, `role_context` from the extraction output. Else skip with an empty `research_json`. Update `current_step = 'researching'`.
5. **Execute Workflow → Strategy** (`h8TwPQT3eLZs3VXR`), inputs `extraction_json`, `research_json`. Update `current_step = 'strategy'`. **(Phase 1 auto-proceeds — no Wait node yet; that arrives in Phase 2.)**
6. **Update `current_step = 'writing'`, `status = 'writing'`.**
7. **IF `toggles.resume`** → **Execute Workflow → Resume Pipeline** (`lJce7yZzEMfsQf2Y`), inputs `strategy_brief`, `company`, `user_redirects=''`. Write the returned Google Doc URL to `job_runs.resume_doc_url`.
8. **IF `toggles.cover`** → **Execute Workflow → Cover Letter Pipeline** (`Hw8pR5nMPfgybB3N`), inputs `strategy_brief`, `chosen_hook` (use the Strategy `recommended_hook_index`), `company`, `user_redirects=''`. Write the returned URL to `job_runs.cover_doc_url`.
9. **Final Supabase Update** → `status = 'done'`, `current_step = 'done'`. On any error path, set `status = 'error'` and `error_message`.

- [ ] **Step 4: Validate**

Call `validate_workflow` with the full code. Fix every error and re-validate until clean.

- [ ] **Step 5: Create the workflow**

Call `create_workflow_from_code` with a `description` like "Job Application Manager v3 — deterministic pipeline (Phase 1, no approval gate). Webhook → Extraction → Research → Strategy → toggled Resume/Cover-Letter; updates job_runs." Then **Activate** it in the n8n UI and copy the **production** `/webhook/<id>` URL (for Task 10).

- [ ] **Step 6: Write the workflow doc**

Create `docs/integrations/n8n-jobmanager.md` documenting: the node map above, the webhook body contract, the two credentials required, and this manual end-to-end checklist:

```
[ ] POST a test body to the production webhook (signed in via the app, not curl) → 200 immediately.
[ ] A job_runs row transitions running → writing → done in the /applications timeline (Realtime).
[ ] With only "research" toggled, no resume/cover Google Doc is produced.
[ ] With "resume" toggled, resume_doc_url is populated and the link opens.
[ ] On a forced failure (e.g. bad input), status becomes 'error' with an error_message.
[ ] The v1 manager (33qUUlaqM9Yq5OX6) is unchanged and still works.
```

- [ ] **Step 7: Commit the doc**

```bash
git add docs/integrations/n8n-jobmanager.md
git commit -m "docs(applications): n8n v3 workflow map + e2e checklist"
```

---

## Task 10: Wire env, full verification, phase wrap

**Files:**

- Modify: `.env.example`, `.env.local`

- [ ] **Step 1: Add env placeholders to `.env.example`**

Append to `.env.example` (under the existing n8n section):

```bash
# Job Application Manager v3 webhook (Phase 1). Same Header Auth convention as
# the chat webhook: N8N_JOBMANAGER_WEBHOOK_SECRET is sent as the `API_KEY`
# header. Use the production /webhook/<id> URL of the "Job Application Manager
# v3" workflow. Unset = the /applications submit is a no-op (placeholder mode).
# N8N_JOBMANAGER_WEBHOOK_URL=https://your-n8n-instance/webhook/your-v3-id
# N8N_JOBMANAGER_WEBHOOK_SECRET=your_api_key_value
```

- [ ] **Step 2: Set the real values in `.env.local`**

Add to `.env.local` (NOT committed — it's gitignored) the production webhook URL from Task 9 Step 5 and the secret from the Header Auth credential:

```bash
N8N_JOBMANAGER_WEBHOOK_URL=https://northwestern-mmm.app.n8n.cloud/webhook/<v3-id>
N8N_JOBMANAGER_WEBHOOK_SECRET=<the API_KEY value>
```

Restart the dev server (`npm run dev`) so the env loads.

- [ ] **Step 3: Run the full suite + coverage**

Run: `npm test`
Expected: all suites pass.
Run: `npm run test:coverage`
Expected: ≥80% on branches/functions/lines/statements (the gate).

- [ ] **Step 4: Manual end-to-end check**

With the dev server running and signed in, open `http://localhost:3000/applications`. Paste a real job description, leave Research + Resume checked, click **Generate strategy**. Confirm: a row appears in the timeline and advances `running → writing → done` via Realtime, and a resume Google Doc link appears. Walk the Task 9 Step 6 checklist.

- [ ] **Step 5: Commit env example**

```bash
git add .env.example
git commit -m "chore(applications): document v3 webhook env vars"
```

- [ ] **Step 6: Phase 1 done**

Phase 1 is complete: `/applications` submits a one-off job to the new deterministic n8n workflow and shows live progress. Next: **Phase 2** (Wait-node approval gate + `pending_approvals` + approval UI) — to be planned as its own document after this phase is verified.

---

## Self-review notes (author checklist — verify during execution)

- **Spec coverage (Phase 1 slice):** webhook contract (Tasks 3, 9), deterministic pipeline (Task 9), `job_runs` table (Task 1), timeline (Tasks 5–6), submit UI/route (Tasks 4, 7, 8), structured toggles (Tasks 2, 7), new workflow leaving v1 intact (Task 9). Approval gate / Zep / batch are intentionally OUT (Phases 2–4).
- **Type consistency:** `JobRun` shape in `types/supabase.ts` (Task 1) is reused verbatim by `JobRunItem` (Task 5), `ProgressTimeline` (Task 6), and the route's insert (Task 4). `Toggles` from `schema.ts` (Task 2) flows through `n8n-client.ts` (Task 3) and the route (Task 4). The webhook body keys (`mode/jobRunId/jd/toggles/userId/sessionId`) match between `n8n-client.ts` (Task 3) and the n8n Webhook contract (Task 9).
- **Decision recorded:** the app creates the `job_runs` row (RLS insert as the user) and passes `jobRunId` to n8n, which updates it via service role. This gives instant timeline feedback and a correlation id.

```

```
