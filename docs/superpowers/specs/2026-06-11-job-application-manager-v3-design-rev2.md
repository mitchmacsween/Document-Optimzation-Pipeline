# Job Application Manager v3 — Design (Rev 2: chat-interface architecture)

**Date:** 2026-06-11
**Status:** Approved for re-planning
**Supersedes:** `2026-06-10-job-application-manager-v3-design.md` (Rev 1, deterministic-pipeline architecture). Rev 1's core goals stand; the **orchestration architecture is replaced**.

---

## 1. Why this revision

Rev 1 chose "Approach 1 — deterministic pipeline + Wait node," which **replaced** the LLM-agent orchestrator with a hard-wired n8n pipeline. After seeing it built, the decision is reversed: **keep the agent.** The front-end should be a **chat interface** to the existing agent manager, with approval handled **conversationally** (the agent proposes a strategy in chat; the user approves or redirects in the same thread; the agent continues using its memory).

This Rev 2 aligns the design with that intent and with the template's existing streaming-chat + chat-memory infrastructure.

## 2. Architecture (Rev 2)

```
① FRONT-END · /applications = a CHAT page (reuses the template's streaming chat machinery)
     - Message thread (useChat + ChatMessages), streamed agent replies rendered as markdown
     - Selection boxes (Research / Resume / Cover) + Approve / Redirect quick-reply buttons
       → these just COMPOSE the chat message sent to the agent
        │
        ▼  POST /api/applications/chat  { chatInput, sessionId, userId, toggles }  (server proxy, API_KEY header)
        │
② AGENT MANAGER · clone of v1 (33qUUlaqM9Yq5OX6), adapted — STILL an LLM agent orchestrating its own tools
     - Webhook/chat trigger, streaming response (NDJSON → parsed by lib/n8n-stream.ts)
     - NEW: Postgres Chat Memory keyed by sessionId  → table n8n_chat_histories
     - NEW: reads the job description + toggles from the chat message/body (not the Google Sheet)
     - NEW: prompt does propose-then-wait: run extraction/research/strategy → PRESENT strategy
       in chat → STOP and ask for approval → on the next turn (approve → write docs; redirect →
       re-strategize). Tools = the existing sub-agents (Extraction/Research/Strategy/Resume/
       Cover-Letter), unchanged.
        │
   SUB-AGENTS (unchanged): Extraction sTQ1ayaH1sMwkvfz · Research 88o6KsvquethsIYR ·
   Strategy h8TwPQT3eLZs3VXR · Resume lJce7yZzEMfsQf2Y · Cover Letter Hw8pR5nMPfgybB3N

SHARED SERVICES
  Supabase: n8n_chat_sessions (sidebar list, Realtime) + n8n_chat_histories (LangChain memory) —
            BOTH ALREADY EXIST in the template. The agent (service role) writes a session row +
            memory; the app reads via RLS, exactly like the template /chat sidebar.
  Zep:      long-term preferences — front-end records turns; approvals/redirects → facts;
            the agent reads prefs (full integration, unchanged from Rev 1 goal #5… see §4).
  Google:   sub-agents still write resume/cover-letter Docs as today.
```

**Approval = conversation.** No Wait node, no `pending_approvals` table, no `job_runs` table. The "loop until approved" is multi-turn chat backed by the agent's memory. Approve/Redirect buttons send canned chat replies.

## 3. What carries over / what's retired from Rev 1 work

**Retired (built under Rev 1, now superseded):**

- The deterministic n8n workflow `xVvU8B6cC56rVA9b` → archive it.
- Front-end: `JobSubmitForm`, `ProgressTimeline`, `JobRunItem`, the `app/api/applications/route.ts` submit handler, `lib/applications/n8n-client.ts` (one-shot dispatch), and the **`job_runs` table/migration/types**. These belong to the pipeline model.

**Carried over:**

- `/applications` route + nav link (re-implemented as a chat page).
- The Zep integration plan (full).
- The cloned-and-adapted agent keeps using the template's chat tables + streaming, which are already wired for `/chat`.
- `lib/applications/schema.ts` toggles concept (reused/trimmed).

## 4. Goals mapping (Rev 1 → Rev 2)

1. **Human approval (#1):** conversational, with Approve/Redirect quick-reply buttons. ✅ (re-shaped)
2. **GUI front-end (#3) + selection boxes (#4):** chat page + toggles that compose the message. ✅
3. **Efficient agent comms (#5):** **deprioritized.** Keeping the agent means it orchestrates its sub-agents via `$fromAI` tool calls (the existing mechanism). We may tune tool descriptions later, but we are NOT rebuilding into a typed pipeline. Accepted trade-off.
4. **RAG (#2):** unchanged — Strategy sub-agent already uses the `documents` RAG.
5. **Zep (#5/full):** unchanged from Rev 1 — front-end records turns; approvals/redirects → facts; agent reads prefs. (Strategy or the manager calls Zep.)

## 5. Component detail

### 5.1 Front-end (chat page)

- `/applications` re-implemented as a chat page modeled on `app/chat/page.tsx`: `useChat` with `TextStreamChatTransport`, `ChatMessages` for rendering, a stable per-session `sessionId`.
- **Selection boxes** (Research/Resume/Cover) sit above/beside the composer; their state is sent with each message (in the body and/or prepended to the text) so the agent knows which actions are in scope.
- **Approve / Redirect buttons** appear on the agent's strategy-proposal message; clicking sends a canned chat turn ("Approved — proceed" / opens a redirect text box).
- Reuses the existing chat **session sidebar** (`n8n_chat_sessions` via Realtime) so past conversations are listed — or a trimmed version scoped to this feature.

### 5.2 Proxy route

- `app/api/applications/chat/route.ts` mirrors `app/api/chat/route.ts`: auth guard, Zod-validate `{ chatInput, sessionId, toggles }`, attach `API_KEY` header, POST to the cloned manager's webhook, stream the NDJSON reply back via `createN8nTextStream`. Forwards `userId` + `toggles`.

### 5.3 Cloned + adapted agent (n8n)

- Clone `33qUUlaqM9Yq5OX6` → new workflow "Job Application Manager v3 (Chat)".
- Add **Postgres Chat Memory** node → `n8n_chat_histories`, keyed by `{{ $json.body.sessionId }}` (Postgres credential via Supabase session pooler — see SUPABASE_SETUP.md).
- On first message of a session, **upsert** a row into `n8n_chat_sessions` (service role) so the sidebar lists it (template pattern).
- Change input: read JD + toggles from the chat body instead of the Google Sheet (keep the sheet path optional/secondary).
- **Prompt update:** propose strategy → ask for approval → wait; on approval run Resume/Cover-Letter tools; on redirect re-run Strategy. Enable streaming response through the webhook.

### 5.4 Data model

- **Use existing** `n8n_chat_sessions` + `n8n_chat_histories` (already in the DB, RLS-scoped, Realtime). **No new tables.** The Rev-1 `job_runs` migration is reverted/removed.

### 5.5 Zep — unchanged from Rev 1 §5.5 (full integration, graceful when `ZEP_API_KEY` unset).

## 6. Testing

- Front-end (TDD): chat page, proxy route (Zod, API_KEY, stream), selection-box → message composition, Approve/Redirect button behavior. Reuse the patterns already covering `/chat`.
- n8n: `validate_workflow` + manual e2e (propose → approve → docs; redirect loop; memory persists across turns).

## 7. Open risks

- **Conversational approval reliability:** the agent must reliably _stop and ask_ before writing docs, and not prematurely call the Resume/Cover-Letter tools. This is prompt-engineering risk — needs iteration and a tool-gating instruction.
- **Streaming + memory wiring** on the cloned agent (Postgres Chat Memory credential, session pooler).
- **Sub-agent outputs** (Resume/Cover-Letter write Docs / a local-disk path; the latter is broken in cloud) — the agent should report what it did in chat; doc links are best-effort.
- **Toggles → agent behavior:** ensure the agent honors the selection boxes (it currently regex-parses keywords; we'll pass structured toggles and update the prompt).

## 8. Phasing (Rev 2)

1. Clone the manager; add memory + chat-body input + streaming (no prompt-approval yet) → GUI chat talks to it end-to-end.
2. Prompt update for propose→approve→act + Approve/Redirect buttons + selection boxes.
3. Zep read/write + front-end context/turns.
4. Polish (session sidebar, error states, optional batch).
5. Retire Rev-1 artifacts (archive `xVvU8B6cC56rVA9b`; remove job_runs + pipeline-model front-end).
