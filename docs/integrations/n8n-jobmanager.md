# n8n — Job Application Manager v3 (Chat)

Rev 2 of the Job Application Manager: a streaming chat agent with conversational memory
that orchestrates the existing v1 sub-workflows as tools. Called by the Next.js front-end
proxy at `/applications`.

- **Workflow name:** Job Application Manager v3 (Chat)
- **Workflow ID:** `yXu3wl4MSrlgCBIw`
- **n8n instance:** https://northwestern-mmm.app.n8n.cloud/workflow/yXu3wl4MSrlgCBIw
- **Status:** created, NOT activated (activate manually after attaching credentials)
- **v1 manager `33qUUlaqM9Yq5OX6` is unchanged.** This is a separate, additive workflow.

## Node map (9 nodes)

```
Chat Webhook (POST /webhook/jobmanager-chat, responseMode: streaming)
   └─> Job Application Manager Agent (@n8n/n8n-nodes-langchain.agent v3.1)
         ├─ model:  OpenRouter Chat Model (moonshotai/kimi-k2.6)
         ├─ memory: Postgres Chat Memory (table n8n_chat_histories, sessionKey = body.sessionId)
         └─ tools:
              ├─ extract_jd            → workflow sTQ1ayaH1sMwkvfz  ($fromAI: jd_text)
              ├─ research_company      → workflow 88o6KsvquethsIYR  ($fromAI: company_name, role_context)
              ├─ generate_strategy     → workflow h8TwPQT3eLZs3VXR  ($fromAI: extraction_json, research_json)
              ├─ tailor_resume         → workflow lJce7yZzEMfsQf2Y  ($fromAI: strategy_brief, user_redirects, company)
              └─ generate_cover_letter → workflow Hw8pR5nMPfgybB3N  ($fromAI: strategy_brief, hook_choice [number], user_redirects, company_name)
```

The agent streams its response back through the webhook (`responseMode: streaming` on the
webhook + `enableStreaming: true` on the agent). No separate Respond to Webhook node is needed.

The system prompt is conversational only (Phase 1): no propose/approve logic. It honors the
`toggles` in the request and only performs enabled actions.

## Request body contract

The front-end proxy POSTs JSON:

```jsonc
{
  "message": "string — the user's chat message; may contain a job description",
  "sessionId": "string — stable per conversation; used as the Postgres memory session key",
  "userId": "string — current user id",
  "toggles": { "research": true, "resume": true, "cover": false },
  "messages": [], // prior chat turns (optional; memory is also persisted server-side)
}
```

The agent reads:

- `text` (user message) = `{{ $json.body.message }}`
- memory session key = `{{ $json.body.sessionId }}`
- toggles are surfaced in the system prompt via `{{ $json.body.toggles }}`

Response: a streamed assistant reply (markdown text), consumed by the chat UI at `/applications`.

## Required manual steps (in n8n)

1. **OpenRouter credential** — auto-assigned to the _OpenRouter Chat Model_ node as
   **"OpenRouter MMM"** (`openRouterApi`). Verify it is correct; reassign if you prefer a
   different OpenRouter credential.
2. **Postgres credential** — open the _Postgres Chat Memory_ node and attach
   **"Postgres account 19"** (`postgres`, id `QaHHqCgZH8QjH5B2`). This was NOT auto-assigned.
3. **(Optional) Inbound auth** — to protect the webhook, set the _Chat Webhook_ node
   Authentication to **Header Auth** with an `API_KEY` header credential, and send the same
   key from the proxy.
4. **Activate** the workflow.
5. **Copy the production webhook URL** `https://northwestern-mmm.app.n8n.cloud/webhook/jobmanager-chat`
   into the app env:
   - `N8N_JOBMANAGER_WEBHOOK_URL=https://northwestern-mmm.app.n8n.cloud/webhook/jobmanager-chat`
   - `N8N_JOBMANAGER_WEBHOOK_SECRET=<the API_KEY header value, if you enabled auth>`
     (add both to `.env.local`).

> The 5 `toolWorkflow` tools reference the v1 sub-workflows by ID. Those sub-workflows must
> remain active/available and keep their existing credentials. This workflow does not modify them.

## End-to-end checklist

- [ ] Credentials attached (OpenRouter on the model node, Postgres on the memory node).
- [ ] Workflow activated.
- [ ] `.env.local` has `N8N_JOBMANAGER_WEBHOOK_URL` (and `_SECRET` if auth enabled); app restarted.
- [ ] Send a message with a job description at `/applications` → a streamed reply renders.
- [ ] Send a follow-up message in the same session → the agent remembers prior context
      (confirms Postgres chat memory works; same `sessionId`).
- [ ] Toggles honored: with `resume:true, cover:false`, the agent tailors the resume but does
      not generate a cover letter (and vice-versa).
- [ ] v1 Job Application Manager (`33qUUlaqM9Yq5OX6`) still runs unchanged.
