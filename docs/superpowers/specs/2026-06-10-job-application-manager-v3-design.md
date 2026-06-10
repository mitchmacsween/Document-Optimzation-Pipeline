# Job Application Manager v3 — Design

**Date:** 2026-06-10
**Status:** Approved for planning
**Scope:** Redesign the n8n "Job Application Manager" multi-agent system and connect it to the Next.js template front-end, adding a human approval loop and Zep long-term memory.

---

## 1. Background — current state

The existing system lives in n8n (`northwestern-mmm.app.n8n.cloud`):

- **Manager** (`Job Application Manager`, id `33qUUlaqM9Yq5OX6`, active): triggered by an n8n **chat trigger**. The chat message is parsed with **regex** to set action flags (`/research/`, `/resume/`, `/cover.letter/`); the job descriptions come from a **Google Sheet** ("Pending Jobs", doc `14ExJsaXRyilRbwGH9GGWHxTGKmZIxTzkR74ZsuNeG4g`), looped one row per execution. The manager is a single AI Agent (`moonshotai/kimi-k2.6`), **stateless** (no memory).
- **Sub-agents**, all attached as `toolWorkflow` tools the LLM calls with `$fromAI`:
  - **Extraction** (`sTQ1ayaH1sMwkvfz`) — `jd_text` → structured JD JSON.
  - **Research** (`88o6KsvquethsIYR`) — `company_name`, `role_context` → company intel (Tavily + Firecrawl), `anthropic/claude-sonnet-4.6`.
  - **Strategy** (`h8TwPQT3eLZs3VXR`) — `extraction_json`, `research_json` → strategy + candidate hooks. **Already uses RAG**: Supabase Vector Store on table `documents`, RPC `match_documents`, OpenAI `text-embedding-3-large` (1536-dim). Has guardrail Code nodes. `anthropic/claude-haiku-4.5`.
  - **Resume Pipeline** (`lJce7yZzEMfsQf2Y`) — `strategy_brief`, `user_redirects`, `company` → editor/judge loop → writes **Google Docs**.
  - **Cover Letter Pipeline** (`Hw8pR5nMPfgybB3N`) — `strategy_brief`, `hook_choice`, `user_redirects`, `company_name` → generator/judge loop → writes **Google Docs**.

**Key limitations addressed by this redesign:**

1. No human-in-the-loop anywhere (no approval before documents are written).
2. Data is passed between steps as LLM-regenerated strings (`$fromAI`) — token-heavy and lossy; the raw JD never reaches the Resume/Cover-Letter pipelines.
3. Entry is chat + regex + Google Sheet, not a real UI.
4. No long-term memory of the user's preferences across applications.

The Next.js template (this repo) already ships the relevant infrastructure: `@supabase/ssr` clients, Realtime patterns (`n8n_chat_sessions`), an **empty `pending_approvals` table**, the server-side n8n proxy pattern (`app/api/chat/route.ts` with `API_KEY` header auth), and Zep helpers (`lib/zep/*`).

---

## 2. Goals

1. **Human approval loop (#1):** after Strategy runs, the pipeline pauses and presents the strategy in the front-end. The user can **Approve as-is**, **Redirect with free-text feedback** (loops back to Strategy and re-presents), or **Pick the cover-letter hook** among the candidates Strategy already generates. Only after approval do the Resume/Cover-Letter pipelines run.
2. **GUI front-end (#3) + structured inputs (#4):** a Next.js "hybrid workspace" replaces the chat-trigger+regex+sheet entry. Left panel: input mode (batch / one-off) + Research/Resume/Cover-Letter toggles. Right panel: live progress timeline + the approval card.
3. **Efficient agent communication (#5):** convert the manager from an LLM-tool orchestrator into a **deterministic pipeline** that passes typed, minimal payloads between steps.
4. **RAG (#2):** Strategy keeps using the existing `documents` RAG. (Already built; no change required. Expanding the ingested corpus is optional follow-up.)
5. **Zep long-term memory (full integration):** mirror the template (front-end retrieves user context before calling the manager, records turns) **and** feed the loop: approve/redirect decisions are written to the user's Zep graph as durable facts, and the Strategy step reads those preferences so future jobs respect them.

## 3. Non-goals / deferred

- Inline editing of the strategy text before approval (approval control #4 from brainstorming) — deferred.
- A general "skip/reject job" control — a minimal version may be added for batch UX, but it is not a v1 requirement.
- Re-architecting the sub-agents' internal logic (editor/judge loops, guardrails) — they stay as-is; only how the manager invokes them changes.
- Locking down `documents` RLS — out of scope (only n8n service-role touches it in this design).

---

## 4. Architecture

```
① FRONT-END (Next.js hybrid workspace, route /applications)
     - Left: input mode [Batch ▸ Google Sheet | One-off ▸ paste JD] + ☑Research ☑Resume ☐Cover
     - Right: live progress timeline + strategy approval card
        │
        ▼  POST (server route, API_KEY header)  { mode, jd?, toggles, userId, sessionId }
        │
② N8N PIPELINE — "Job Application Manager v3" (deterministic, replaces LLM orchestrator)
     Extraction ──► Research ──► Strategy ──► ⏸ WAIT (resume-on-webhook) ──► branch
        (jd_text)   (company,    (extraction_json,        │                    ├─ ✓ Approve ─► Resume / Cover-Letter ─► Google Docs
                     role_ctx)    research_json,           │                    └─ ↻ Redirect (+feedback) ─┐
                                  zep_prefs)               │                                              │
                                      ▲────────────────────┴──────── loops back to Strategy ─────────────┘

SHARED SERVICES
  Supabase: pending_approvals (strategy + resume_url; Realtime→approval card)
            job_runs (progress; Realtime→timeline)
            documents (RAG corpus; n8n service-role only)
  Zep:      front-end records turns; approvals/redirects→facts; Strategy reads prefs
  Google:   Sheet "Pending Jobs" (batch in); Docs (resume/cover-letter out)
```

**Happy path:** submit → pipeline runs Extraction/Research/Strategy → strategy written to `pending_approvals` (status `pending`) with the Wait resume URL → front-end shows the approval card via Realtime → user approves → front-end posts to the resume URL → pipeline runs the writers → docs land in Google Docs, links written to `job_runs`.

**Redirect loop:** user submits feedback → posted to resume URL with decision `redirect` → pipeline loops back to Strategy with `user_redirects` → new strategy written (iteration incremented) → re-presented.

---

## 5. Component detail

### 5.1 n8n pipeline & data contract (#5)

- New **Webhook** trigger (production `/webhook/<id>`) with **Header Auth credential named `API_KEY`** (matches the template convention).
- Sub-agents invoked via **`executeWorkflow`** with typed payloads — only what each needs, as real node data (no `$fromAI` re-serialization):
  - Extraction ← `jd_text`
  - Research ← `company_name`, `role_context` (from Extraction output)
  - Strategy ← `extraction_json`, `research_json`, `zep_prefs`
  - Resume ← `strategy_brief`, `company`, `user_redirects`
  - Cover Letter ← `strategy_brief`, `chosen_hook`, `company`
- **Batch mode:** n8n reads the Google Sheet (as today) and processes the queue. **One-off mode:** JD text arrives in the webhook body. Both feed the same pipeline.
- **Redirect loop:** no hard cap; an `iteration` counter increments each loop and is surfaced in the UI.
- The webhook accepts `{ mode: "batch"|"oneoff", jd?, toggles:{research,resume,cover}, userId, sessionId }`.

### 5.2 Approval mechanism (Wait node)

- After Strategy, an n8n **Wait** node configured to **resume on webhook call** pauses the execution and yields a resume URL.
- Before pausing, the pipeline **upserts a `pending_approvals` row** (service-role connection) containing the strategy JSON, candidate hooks, recommended index, `job_run_id`, `user_id`, `session_id`, the **resume URL**, and `status = pending`.
- The front-end reads the row via Realtime, renders the approval card, and on action posts `{ decision: "approve"|"redirect", chosen_hook_index?, feedback? }` to a **server-side Next.js route**, which forwards to the n8n resume URL (keeping any secret server-side).
- On resume, the pipeline branches: `approve` → run enabled writers; `redirect` → loop to Strategy with `user_redirects = feedback`.

### 5.3 Front-end (Next.js)

- New route `/applications` (login-gated by the existing `proxy.ts`).
- Reuses shadcn primitives from `components/ui/` and the template's Supabase browser client + Realtime patterns.
- **Server routes:** `app/api/applications/route.ts` (submit → n8n webhook, attaches `API_KEY`); `app/api/applications/approve/route.ts` (decision → n8n resume URL). Both use the server Supabase client so requests run as the signed-in user; inputs validated with **Zod**.
- **Left panel:** input-mode toggle, JD textarea (one-off), the three checkboxes, submit button.
- **Right panel:** progress timeline (Realtime on `job_runs`) and the approval card (Realtime on `pending_approvals`) with Approve / Redirect (free-text) / hook radio.

### 5.4 Supabase data model

- **`pending_approvals`** (exists, empty): `id`, `user_id`, `session_id`, `job_run_id`, `status` (`pending`/`approved`/`redirected`/`skipped`), `strategy_json` (jsonb), `candidate_hooks` (jsonb), `recommended_hook_index` (int), `chosen_hook_index` (int, null), `feedback` (text, null), `resume_url` (text), `iteration` (int), `created_at`, `updated_at`. **Per-user RLS** (select/update own rows); n8n writes via service role.
- **`job_runs`** (new): `id`, `user_id`, `company` (text, null until known), `mode`, `toggles` (jsonb), `status` (`running`/`awaiting_approval`/`writing`/`done`/`error`), `current_step` (text), `iteration` (int), `resume_doc_url` (text, null), `cover_doc_url` (text, null), `error_message` (text, null), `created_at`, `updated_at`. **Per-user RLS**; added to the `supabase_realtime` publication.
- Both tables added as a version-controlled migration under `supabase/migrations/`, applied via the Supabase MCP (`apply_migration`); `types/supabase.ts` regenerated afterward.
- `documents` (RAG) unchanged. It currently has **RLS disabled** — acceptable here because only n8n (service role) reads it; if the front-end ever reads it directly, policies must be added first.

### 5.5 Zep integration (full)

- Reuse `lib/zep/*`. Front-end retrieves the user's Zep context before submit and records turns (template pattern). Keyed by Supabase `userId` via `lib/zep/identity.ts`.
- **n8n side:** Strategy makes an HTTP call to Zep (keyed by `userId`) to fetch the user's preferences and injects them into its prompt as `zep_prefs`. On Approve/Redirect, the manager writes the decision to the user's Zep graph as a fact (e.g. "prefers hook ②", "drop agency framing for fintech roles").
- **Graceful degradation:** if `ZEP_API_KEY` is unset, Strategy skips `zep_prefs` and the front-end memory features stay dormant — identical to the template's existing behavior.

---

## 6. Testing strategy

- **Front-end (TDD, repo law):** every component/route gets a failing test first (`tests/` mirror), 80% coverage gate (`jest.config.js`). Cover: submit route (Zod validation, API_KEY attach, n8n call mocked), approve route (decision forwarding), approval-card and timeline components (Realtime subscription mocked, loading/empty/error states).
- **n8n workflows:** cannot be unit-tested like app code. Validate with the n8n MCP `validate_workflow` before saving, then manual end-to-end runs (one-off and batch) checking: pipeline advances, `pending_approvals`/`job_runs` rows appear, approval resumes correctly, redirect loops, docs are produced. Document a manual test checklist in the plan.

## 7. Phasing (build order)

1. Webhook contract + deterministic pipeline + `job_runs` table & timeline (no approval yet — auto-proceed).
2. Wait gate + `pending_approvals` usage + approval UI (approve / redirect / hook).
3. Zep read (Strategy prefs) + write (approval/redirect facts) + front-end context/turns.
4. Batch mode (Google Sheet queue) + polish (iteration display, error states, doc links).

## 8. Open risks & decisions

- **Long-running executions:** the Wait node keeps the execution "running" while awaiting approval. The workflow must stay **Active**; verify n8n's execution-timeout settings tolerate realistic approval delays.
- **Resume-URL delivery & security:** the n8n resume URL must travel n8n → `pending_approvals` → front-end and be callable only by the owning user. Front-end calls it through a server route; confirm whether the resume webhook needs its own auth and that the URL isn't exposed to other users (RLS on `pending_approvals` scopes the read).
- **Migrating off the LLM orchestrator:** the new pipeline is deterministic, so the toggle flags come from the UI, not the model. Confirm no orchestration nuance (e.g. conditional hook heuristics) is lost; port needed heuristics into pipeline logic or keep them inside Strategy.
- **v2 manager** (`Td3gVZWiDgRPLV4T`) is not MCP-accessible; this design builds from the active v1 manager. Decide whether v3 is a new workflow or an in-place rewrite (recommend: new workflow, leave v1 intact until v3 is verified).

## 9. Success criteria

- From `/applications`, a signed-in user can submit a one-off job, watch the timeline progress, receive a strategy, Approve or Redirect (looping), pick a hook, and get resume/cover-letter Google Docs links — all driven by the new deterministic n8n pipeline.
- Batch mode processes the Google Sheet queue through the same flow.
- Redirecting visibly re-runs Strategy with the feedback; the same feedback, once written to Zep, measurably shifts the _next_ job's first-draft strategy.
- Front-end tests pass with ≥80% coverage; n8n workflows pass `validate_workflow` and the manual end-to-end checklist.
