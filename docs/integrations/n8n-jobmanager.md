# n8n — Job Application Manager v3

This is the deterministic n8n pipeline that powers **Job Application Manager v3** (Phase 1).
It is triggered by a webhook, runs the Extraction → (optional) Research → Strategy →
(optional) Resume sub-workflows, and reports progress by **updating a Supabase `job_runs`
row** as it goes. There is **no Cover Letter step** and **no document-URL capture** in v3.

- **Workflow ID:** `xVvU8B6cC56rVA9b`
- **Workflow name:** `Job Application Manager v3`
- **Editor URL:** https://northwestern-mmm.app.n8n.cloud/workflow/xVvU8B6cC56rVA9b
- **n8n MCP server id:** `f6f8fb5e-753c-430f-a346-f40a6cd35a34`

> The v1 manager (`33qUUlaqM9Yq5OX6`) is a separate workflow and was **not** touched.

---

## Webhook body contract

The webhook listens for **POST** on path `/webhook/job-application-manager-v3`
(test URL uses `/webhook-test/...`). Expected JSON body:

```json
{
  "mode": "oneoff",
  "jobRunId": "<uuid of the job_runs row to update>",
  "jd": "<full job description text>",
  "toggles": { "research": true, "resume": true, "cover": false },
  "userId": "<auth user id>",
  "sessionId": "<client session id>"
}
```

Notes:

- `jobRunId` MUST be the `id` of an existing `job_runs` row — every Supabase node filters on
  `id = {{ body.jobRunId }}`. The caller is responsible for inserting that row first.
- `toggles.cover` is accepted but **ignored** in v3 (no cover-letter path).
- **Authentication is `none`.** The webhook responds **immediately** (`responseMode:
onReceived`, HTTP 200) so the caller is not blocked by the long pipeline. The caller may
  send an `API_KEY` header; an unauthenticated webhook simply ignores it. **You should add
  Header Auth later to secure it** (see manual steps below).

---

## Node map (execution order)

| #   | Node name                            | Type                                   | What it does                                                                                                                                                                                                                                                        |
| --- | ------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Job Run Webhook**                  | `webhook` (POST, `onReceived`)         | Entry point. Responds 200 immediately. Body carried forward via `$('Job Run Webhook')`.                                                                                                                                                                             |
| 2   | **Set Run Running**                  | `supabase` update `job_runs`           | `id = {{ $json.body.jobRunId }}` → `status=running`, `current_step=extracting`.                                                                                                                                                                                     |
| 3   | **Run Extraction Agent**             | `executeWorkflow` → `sTQ1ayaH1sMwkvfz` | Input `jd_text = body.jd`. Returns extraction JSON as a **string** in `output`.                                                                                                                                                                                     |
| 4   | **Parse Extraction**                 | `code` (run once per item)             | Parses the extraction JSON string (strips ```fences). Emits`extraction_json`(original string),`company`, `role_title`, `team_or_function`, `role_context` (`role_title — team_or_function`).                                                                        |
| 5   | **Research Toggled?**                | `if`                                   | `body.toggles.research === true`.                                                                                                                                                                                                                                   |
| 5a  | **Run Research Agent** (true)        | `executeWorkflow` → `88o6KsvquethsIYR` | Inputs `company_name = company`, `role_context = role_context`.                                                                                                                                                                                                     |
| 5b  | **Capture Research Output** (true)   | `set`                                  | Stores research `output` (stringified) as `research_json`.                                                                                                                                                                                                          |
| 5c  | **Skip Research** (false)            | `set`                                  | Sets `research_json = ""`.                                                                                                                                                                                                                                          |
| 6   | **Set Step Strategy**                | `supabase` update                      | `current_step=strategy`. Both research branches converge here.                                                                                                                                                                                                      |
| 7   | **Run Strategy Agent**               | `executeWorkflow` → `h8TwPQT3eLZs3VXR` | Inputs `extraction_json` (string), `research_json` (string or `""`). Returns a **structured object** (`resume_strategy`, `ats_keyword_optimization`, `cover_letter_strategy`, optional `guardrail_flag`/`violations`), OR `{ error, reason }` on a guardrail block. |
| 8   | **Strategy Blocked?**                | `if`                                   | True when `$json.error` exists.                                                                                                                                                                                                                                     |
| 8a  | **Set Run Error (Guardrail)** (true) | `supabase` update                      | `status=error`, `error_message = {{ reason }}`. Pipeline ends.                                                                                                                                                                                                      |
| 9   | **Set Run Writing** (false)          | `supabase` update                      | `status=writing`, `current_step=writing`.                                                                                                                                                                                                                           |
| 10  | **Resume Toggled?**                  | `if`                                   | `body.toggles.resume === true`.                                                                                                                                                                                                                                     |
| 10a | **Run Resume Pipeline** (true)       | `executeWorkflow` → `lJce7yZzEMfsQf2Y` | Inputs `strategy_brief = {{ JSON.stringify(<Strategy output object>) }}`, `user_redirects = ""`, `company = company`. Side-effect workflow (writes a Google Doc); returns nothing useful — **no URL is captured**.                                                  |
| 11  | **Set Run Done**                     | `supabase` update                      | `status=done`, `current_step=done`. Both resume branches converge here.                                                                                                                                                                                             |

### Data-flow notes / approximations

- **`executeWorkflow` replaces the current item** with the sub-workflow's output. To survive
  this, the webhook body is always read via `$('Job Run Webhook').item.json.body.*`, the
  parsed extraction via `$('Parse Extraction').item.json.*`, and the Strategy result via
  `$('Run Strategy Agent').item.json`.
- **Extraction parsing (approximated):** the Extraction sub-agent returns its JSON in the AI
  Agent's `output` field as a string. `Parse Extraction` reads `$json.output` (falling back to
  `.text`/`.data`), strips markdown code fences, and `JSON.parse`s it. If parsing fails it
  falls back to `{}` so `company`/`role_context` are empty strings rather than crashing.
- **`research_json` (approximated):** captured as the Research agent's `output`, stringified if
  it is an object. When research is skipped it is `""`.
- **`strategy_brief` format (approximated):** passed as `JSON.stringify(<entire Strategy output
object>)`. If the Resume Pipeline expects a different envelope, adjust the
  `Run Resume Pipeline` input mapping.
- **Guardrail detection:** the `Strategy Blocked?` IF uses the `exists` operator on
  `$json.error`. `validate_workflow` emits a benign warning that no predecessor outputs
  `error` — that is expected, because `error` only appears on the guardrail-block path, not the
  happy path.
- **Error handling:** the guardrail block is handled explicitly (node 8a). A broader catch-all
  error trigger was intentionally **not** added to keep the workflow simple; failures in a
  sub-workflow surface as a failed execution in n8n. Consider adding an Error Trigger workflow
  later if you want unexpected failures to also set `job_runs.status='error'`.

---

## REQUIRED manual finish-up steps

1. **Supabase credential** — on create, n8n **auto-assigned "Supabase account 16"** to all five
   `job_runs` update nodes (`Set Run Running`, `Set Step Strategy`, `Set Run Error (Guardrail)`,
   `Set Run Writing`, `Set Run Done`). **Open the workflow and confirm** each Supabase node shows
   that credential; re-select it if any show "Select Credential".
2. _(Optional, recommended)_ **Secure the webhook** — create a **Header Auth** credential named
   `API_KEY` (header name `API_KEY`, value = your shared secret), then set the
   `Job Run Webhook` node's _Authentication_ to **Header Auth** and attach it. Until then the
   webhook is unauthenticated.
3. **Activate** the workflow (toggle top-right in the n8n editor).
4. Copy the **production** webhook URL (`/webhook/job-application-manager-v3`) into the app's
   `.env.local`:
   ```
   N8N_JOBMANAGER_WEBHOOK_URL=https://northwestern-mmm.app.n8n.cloud/webhook/job-application-manager-v3
   N8N_JOBMANAGER_WEBHOOK_SECRET=<the API_KEY secret you chose in step 2, if any>
   ```
   Then **restart the dev server** so the new env vars are picked up.

---

## Manual e2e checklist

```
[ ] Supabase credential attached to all job_runs update nodes; workflow Activated.
[ ] N8N_JOBMANAGER_WEBHOOK_URL/_SECRET set in .env.local; dev server restarted.
[ ] Submit a one-off job at /applications (signed in) → job_runs row appears, advances running → writing → done.
[ ] With only Research+Resume toggled, a tailored resume Google Doc is produced in Drive.
[ ] A guardrail-blocked input sets status='error' with the reason.
[ ] v1 manager (33qUUlaqM9Yq5OX6) is unchanged.
```
