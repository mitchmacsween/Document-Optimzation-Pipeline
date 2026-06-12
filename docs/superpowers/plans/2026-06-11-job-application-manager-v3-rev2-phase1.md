# Job Application Manager v3 (Rev 2) — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make `/applications` a streaming **chat interface** to the (cloned, adapted) agent manager, with selection boxes. Foundation only — conversational _approval_ (propose→approve prompt + Approve/Redirect buttons) is Phase 2.

**Architecture:** Mirrors the template's existing `/chat`: `app/applications/page.tsx` (`useChat` + `TextStreamChatTransport`) → `app/api/applications/chat/route.ts` (proxy, streams n8n NDJSON via `createN8nTextStream`) → cloned n8n agent manager (Postgres Chat Memory on `n8n_chat_histories`, reads JD+toggles from the body). Reuses the template's chat tables, `ChatMessages`, and `lib/n8n-stream`. The Rev-1 deterministic pieces are removed.

**Spec:** `docs/superpowers/specs/2026-06-11-job-application-manager-v3-design-rev2.md`.
**Branch:** `job-application-manager-v3`.

**Reference files to copy patterns from (read these; the new files are close variants):**

- `app/chat/page.tsx` — the chat page (useChat, transport, ChatMessages, sessionId, sidebar).
- `app/api/chat/route.ts` — the proxy route (Zod, API_KEY header, `createN8nTextStream`, placeholder mode).
- `app/components/chat/ChatMessages.tsx` — message rendering (reuse as-is).
- existing tests for the above under `tests/` (mirror their mocking style).

---

## Task 0: Retire Rev-1 (pipeline) artifacts

**Goal:** remove the deterministic-model code so the branch reflects Rev 2. The n8n workflow `xVvU8B6cC56rVA9b` is already archived.

- [ ] **Step 1: Drop the `job_runs` table (live DB).** Via Supabase MCP `apply_migration`, project `kshutthhafzlqxmueotr`, name `drop_job_runs`, query: `DROP TABLE IF EXISTS public.job_runs CASCADE;`
- [ ] **Step 2: Delete Rev-1 source + tests + docs.** Run:

```bash
cd "/Users/mitchellmacsween/Claude Cowork/Module 4/mmm-cc-nextjs-template"
git rm \
  app/components/applications/JobSubmitForm.tsx \
  app/components/applications/ProgressTimeline.tsx \
  app/components/applications/JobRunItem.tsx \
  app/api/applications/route.ts \
  lib/applications/n8n-client.ts \
  app/applications/page.tsx \
  supabase/migrations/20260610000000_create_job_runs.sql \
  docs/integrations/n8n-jobmanager.md \
  tests/unit/app/components/applications/test_JobSubmitForm.test.tsx \
  tests/unit/app/components/applications/test_ProgressTimeline.test.tsx \
  tests/unit/app/components/applications/test_JobRunItem.test.tsx \
  tests/integration/api/test_applications.test.ts \
  tests/unit/lib/applications/test_n8n-client.test.ts \
  tests/unit/app/applications/test_page.test.tsx
```

(KEEP `lib/applications/schema.ts` + its test — `togglesSchema` is reused. KEEP the `/applications` nav link in `Navigation.tsx` — the page is rebuilt in Task 2.)

- [ ] **Step 3: Revert the `job_runs` types.** In `types/supabase.ts`, remove the `job_runs:` table block from `Database['public']['Tables']` and delete the `JobRun`/`JobRunInsert`/`JobRunUpdate` exports. Leave the rest untouched.
- [ ] **Step 4: Verify + commit.** Run `npm test` (expect green — the removed tests are gone, the rest pass) and `npm run type-check` (expect 0 errors; confirm nothing still imports the deleted modules — if the nav link or anything references the old page it's fine, Next resolves `/applications` to the new page in Task 2; grep `grep -rn "job_runs\|JobRunItem\|ProgressTimeline\|JobSubmitForm\|n8n-client" app lib types` should return nothing except possibly schema). Then:

```bash
git add -A && git commit -m "chore(applications): retire Rev-1 pipeline artifacts (Rev 2 pivot)"
```

---

## Task 1: Proxy route `app/api/applications/chat/route.ts`

**Files:** Create `app/api/applications/chat/route.ts`; Test `tests/integration/api/test_applications_chat.test.ts`.

This is a close variant of `app/api/chat/route.ts`. Differences: (a) it targets **`N8N_JOBMANAGER_WEBHOOK_URL` / `N8N_JOBMANAGER_WEBHOOK_SECRET`**; (b) the request body also carries **`toggles`** which is forwarded to n8n; (c) keep the Zep wiring OPTIONAL/out for Phase 1 (add in Phase 3) — just proxy + stream + placeholder.

- [ ] **Step 1: Write the failing test** — `tests/integration/api/test_applications_chat.test.ts`. Use `@jest-environment node` (top docblock). Mock `@/lib/supabase/server` (auth.getUser → user) and `@/lib/logger`. Cover:
  - placeholder mode: with `N8N_JOBMANAGER_WEBHOOK_URL` unset, POST `{ messages:[{role:'user',parts:[{type:'text',text:'hi'}]}], sessionId:'s1', toggles:{research:true,resume:true,cover:false} }` → 200, body is a readable text stream (assert `res.ok` / status 200).
  - invalid body: POST `{}` → 400.
  - proxy mode: set `process.env.N8N_JOBMANAGER_WEBHOOK_URL='https://n8n.example/webhook/x'`; mock `global.fetch` to resolve `{ ok:true, body: <a ReadableStream emitting one NDJSON line '{"type":"item","content":"hello"}\n'> }`; POST a valid body → assert fetch called with that URL, method POST, and that the JSON body includes `toggles` and `sessionId`.

```typescript
/** @jest-environment node */
import { POST } from '@/app/api/applications/chat/route';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }));

const validBody = {
  messages: [
    {
      role: 'user',
      parts: [{ type: 'text', text: 'Tailor me for the Stripe PM role' }],
    },
  ],
  sessionId: 's1',
  toggles: { research: true, resume: true, cover: false },
};
function req(body: unknown) {
  return new Request('http://localhost/api/applications/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const origEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...origEnv };
  delete process.env.N8N_JOBMANAGER_WEBHOOK_URL;
  (createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
  });
});
afterAll(() => {
  process.env = origEnv;
});

describe('POST /api/applications/chat', () => {
  it('streams a placeholder reply when the webhook is unset', async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
  });
  it('returns 400 on an invalid body', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
  it('proxies to the jobmanager webhook with toggles + sessionId', async () => {
    process.env.N8N_JOBMANAGER_WEBHOOK_URL = 'https://n8n.example/webhook/x';
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"type":"item","content":"hi"}\n'));
        c.close();
      },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
    const res = await POST(req(validBody));
    expect(global.fetch).toHaveBeenCalled();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://n8n.example/webhook/x');
    const sent = JSON.parse(init.body);
    expect(sent.sessionId).toBe('s1');
    expect(sent.toggles).toEqual({
      research: true,
      resume: true,
      cover: false,
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npm test -- tests/integration/api/test_applications_chat.test.ts`).
- [ ] **Step 3: Implement the route.** Copy `app/api/chat/route.ts` structure. Use this implementation (Zep deferred to Phase 3):

```typescript
import { createTextStreamResponse, simulateReadableStream } from 'ai';
import { z } from 'zod';
import { createN8nTextStream } from '@/lib/n8n-stream';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

const uiMessageSchema = z.object({
  role: z.string(),
  parts: z
    .array(z.object({ type: z.string(), text: z.string().optional() }))
    .optional(),
});
const requestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1),
  sessionId: z.string().optional(),
  toggles: z
    .object({ research: z.boolean(), resume: z.boolean(), cover: z.boolean() })
    .optional(),
});
type UiMessage = z.infer<typeof uiMessageSchema>;

function latestUserText(messages: UiMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser?.parts) return '';
  return lastUser.parts
    .map((p) => (p.type === 'text' && p.text ? p.text : ''))
    .join(' ')
    .trim();
}
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
async function getUserId(): Promise<string | undefined> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return jsonError('Invalid request body', 400);

  const userText = latestUserText(parsed.data.messages);
  const sessionId = parsed.data.sessionId ?? crypto.randomUUID();
  const toggles = parsed.data.toggles ?? {
    research: true,
    resume: true,
    cover: false,
  };
  const webhookUrl = process.env.N8N_JOBMANAGER_WEBHOOK_URL;

  if (webhookUrl) {
    const userId = await getUserId();
    let upstream: Response;
    try {
      upstream = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.N8N_JOBMANAGER_WEBHOOK_SECRET
            ? { API_KEY: process.env.N8N_JOBMANAGER_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({
          message: userText,
          sessionId,
          userId,
          toggles,
          messages: parsed.data.messages,
        }),
      });
    } catch (error) {
      logger.error('jobmanager webhook unreachable', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return jsonError('Could not reach the n8n webhook', 502);
    }
    if (!upstream.ok || !upstream.body) {
      logger.error('jobmanager webhook returned an error', {
        status: upstream.status,
      });
      return jsonError(
        `n8n webhook returned an error (${upstream.status})`,
        502
      );
    }
    const textStream = upstream.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createN8nTextStream());
    return createTextStreamResponse({ textStream });
  }

  // Placeholder until the jobmanager webhook is configured.
  const reply =
    `👋 **Placeholder** from \`/api/applications/chat\`.\n\n` +
    (userText ? `You said: _"${userText}"_\n\n` : '') +
    `Actions: ${
      Object.entries(toggles)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ') || 'none'
    }.\n\n` +
    `Set \`N8N_JOBMANAGER_WEBHOOK_URL\` to stream the real agent.`;
  const chunks = reply.match(/\S+\s*/g) ?? [reply];
  return createTextStreamResponse({
    textStream: simulateReadableStream({
      chunks,
      initialDelayInMs: 100,
      chunkDelayInMs: 25,
    }),
  });
}
```

- [ ] **Step 4: Run → PASS** (3 tests).
- [ ] **Step 5: Commit** `feat(applications): chat proxy route to the jobmanager agent`.

---

## Task 2: Chat page `app/applications/page.tsx` + selection boxes

**Files:** Create `app/applications/page.tsx`; Create `app/components/applications/ActionToggles.tsx`; Tests `tests/unit/app/applications/test_page.test.tsx`, `tests/unit/app/components/applications/test_ActionToggles.test.tsx`.

The page is a close variant of `app/chat/page.tsx`: `useChat` + `TextStreamChatTransport({ api: '/api/applications/chat', body: { sessionId, toggles } })`, `ChatMessages`, a composer. ADD an `ActionToggles` row (Research/Resume/Cover checkboxes, defaults research+resume on) above the composer; `toggles` state is included in the transport body (recreate the transport via `useMemo` on `[sessionId, toggles]`). For Phase 1 you may omit the session sidebar/context panel (add later); keep it focused.

- [ ] **Step 1:** Write `ActionToggles` failing test (renders 3 checkboxes; toggling calls `onChange` with the new toggles object).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `ActionToggles.tsx` — a small client component: `{ toggles, onChange }` props, three shadcn `Checkbox` + `Label` (id/htmlFor pairs, design tokens only), mirroring the a11y approach used elsewhere.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Write the page failing test — mock `@/lib/supabase/client` (as the existing `/chat` page test does, incl `auth` for Navigation) and stub `@ai-sdk/react`'s `useChat` (return `{ messages: [], sendMessage: jest.fn(), setMessages: jest.fn(), status: 'ready', error: undefined }`). Assert the hero heading (/job applications/i) and the message input + the three toggles render.
- [ ] **Step 6:** Run → FAIL.
- [ ] **Step 7:** Implement `app/applications/page.tsx` modeled on `app/chat/page.tsx` (read it). Key bits: `sessionId` via `generateId()`; `toggles` state (default `{research:true,resume:true,cover:false}`); `transport = useMemo(() => new TextStreamChatTransport({ api:'/api/applications/chat', body:{ sessionId, toggles } }), [sessionId, toggles])`; render `PageHero` (eyebrow "n8n · Job Applications", title "Job Applications"), `ChatMessages`, the `ActionToggles` row, and the composer form (Input + Send Button), all inside `PageShell`/`Card` like `/chat`.
- [ ] **Step 8:** Run → PASS; then `npm run validate` (0 errors).
- [ ] **Step 9:** Commit `feat(applications): chat page with action toggles`.

---

## Task 3: Clone + adapt the agent manager (n8n MCP)

No app code. Via the n8n MCP (follow the required sequence: `get_sdk_reference` → `get_node_types` → edit → `validate_workflow`).

- [ ] **Step 1:** There is no MCP "duplicate" call — get the v1 manager's code (`get_workflow_details` for `33qUUlaqM9Yq5OX6`; if it exceeds the token limit, read the saved file with `jq`) and `create_workflow_from_code` a NEW workflow named **"Job Application Manager v3 (Chat)"** from an adapted copy. Do NOT modify v1.
- [ ] **Step 2: Adapt the clone:**
  - **Trigger/input:** ensure it accepts a webhook POST whose body has `message`, `sessionId`, `userId`, `toggles`. Read the job description from `{{ $json.body.message }}` and the action flags from `{{ $json.body.toggles }}` (replace the Google-Sheet read + regex-flag parsing for the chat path).
  - **Memory:** add a **Postgres Chat Memory** node (LangChain) wired to the AI Agent, table `n8n_chat_histories`, session key `={{ $json.body.sessionId }}`. Use a **Postgres** credential via the Supabase session pooler (the user attaches it in the UI — credential IDs are API-redacted).
  - **Session row:** on a new session, upsert into `n8n_chat_sessions` (`session_id`, `user_id` from body, a short `name`) via the Supabase/Postgres connection so the chat sidebar can list it (template pattern). (Optional in Phase 1 if it complicates the build — note if deferred.)
  - **Streaming:** enable the AI Agent's streaming response through the webhook (so the proxy can stream NDJSON).
  - Keep the agent's tool wiring to the sub-agents AS-IS (it stays an agent). Do NOT add the propose/approve prompt yet (Phase 2).
- [ ] **Step 3:** `validate_workflow` until clean; `create_workflow_from_code`.
- [ ] **Step 4:** Write `docs/integrations/n8n-jobmanager.md` (fresh, Rev 2): node map, body contract (`message/sessionId/userId/toggles`), required manual steps (attach Postgres + Supabase credentials; optionally Header Auth `API_KEY`; **Activate**; copy production `/webhook/<id>` URL → `.env.local` `N8N_JOBMANAGER_WEBHOOK_URL`/`_SECRET`), and an e2e checklist (send a message from `/applications` → streamed reply; memory persists across two turns; v1 untouched). Commit it.

---

## Task 4: Wire + verify (manual, user)

- [ ] In the n8n UI: attach the Postgres + Supabase credentials to the cloned agent; (optional) add Header Auth `API_KEY`; **Activate**; copy the production webhook URL.
- [ ] Set `N8N_JOBMANAGER_WEBHOOK_URL` / `_SECRET` in `.env.local`; restart `npm run dev`.
- [ ] Sign in, open `/applications`, send a message → a streamed agent reply renders; send a follow-up → the agent remembers (memory works). Toggles ride along in the body.
- [ ] `npm test` green; `npm run test:coverage` ≥ 80%.

---

## Notes / deferred to later phases

- **Phase 2:** propose→approve prompt on the agent + Approve/Redirect quick-reply buttons on the proposal message; make the agent honor `toggles` precisely.
- **Phase 3:** Zep read/write (mirror `/api/chat`'s Zep wiring in the proxy; agent reads prefs).
- **Phase 4:** session sidebar/context panel on `/applications`; optional batch.
