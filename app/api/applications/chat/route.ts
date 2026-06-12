import { createTextStreamResponse, simulateReadableStream } from 'ai';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';
import { createN8nTextStream } from '@/lib/n8n-stream';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getZepClient } from '@/lib/zep/client';
import { retrieveUserContext, recordChatTurn } from '@/lib/zep/chat-memory';
import { createCaptureStream } from '@/lib/zep/stream-capture';

export const maxDuration = 30;

// Cap the Zep context lookup so a slow memory service never stalls the reply.
const ZEP_CONTEXT_TIMEOUT_MS = 3000;

const uiMessageSchema = z.object({
  role: z.string(),
  parts: z
    .array(z.object({ type: z.string(), text: z.string().optional() }))
    .optional(),
});
const requestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1),
  // Stable per-conversation id so the n8n AI Agent can keep memory across turns.
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

const ACTION_KEYS = ['research', 'resume', 'cover'] as const;
const ACTION_LABELS: Record<(typeof ACTION_KEYS)[number], string> = {
  research: 'company research',
  resume: 'resume tailoring',
  cover: 'cover letter',
};
type ActionToggles = Record<(typeof ACTION_KEYS)[number], boolean>;

/**
 * Append a plain-English action directive to the user's message so the agent
 * reliably honors the selection boxes. We compose it into the text (rather than
 * relying on the agent reading a structured `toggles` object, which n8n renders
 * as `[object Object]`).
 */
function composeMessage(userText: string, toggles: ActionToggles): string {
  const label = (keys: readonly string[]) =>
    keys
      .map((k) => ACTION_LABELS[k as keyof typeof ACTION_LABELS])
      .join(', ') || 'none';
  const enabled = ACTION_KEYS.filter((k) => toggles[k]);
  const disabled = ACTION_KEYS.filter((k) => !toggles[k]);
  return (
    `${userText}\n\n` +
    `[Action settings for this request — ONLY perform: ${label(enabled)}. ` +
    `Do NOT perform or call tools for: ${label(disabled)}.]`
  );
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getSignedInUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Proxy the chat request to the Job Application Manager n8n agent and stream
 * its reply back to the UI.
 *
 * - Targets `N8N_JOBMANAGER_WEBHOOK_URL` / `N8N_JOBMANAGER_WEBHOOK_SECRET`.
 * - Forwards `toggles` (research / resume / cover) so the workflow can branch.
 * - Falls back to a placeholder stream when the URL is unset.
 * - When Zep is active, the user's long-term context is retrieved and injected
 *   into the n8n body, and the streamed reply is captured to record the clean
 *   user turn (not the composed directive message) once streaming finishes.
 */
export async function POST(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError('Invalid request body', 400);
  }

  const userText = latestUserText(parsed.data.messages);
  const sessionId = parsed.data.sessionId ?? crypto.randomUUID();
  const toggles = parsed.data.toggles ?? {
    research: true,
    resume: true,
    cover: false,
  };
  const webhookUrl = process.env.N8N_JOBMANAGER_WEBHOOK_URL;

  // ---- Real n8n agent: proxy the workflow and stream its response back ----
  if (webhookUrl) {
    const zep = getZepClient();
    const user = await getSignedInUser();
    const context = zep
      ? await retrieveUserContext(
          zep,
          sessionId,
          user?.id,
          ZEP_CONTEXT_TIMEOUT_MS
        )
      : '';

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
          message: composeMessage(userText, toggles),
          context,
          sessionId,
          userId: user?.id,
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

    const baseTextStream = upstream.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createN8nTextStream());

    // When Zep is active, tee the clean reply through a capture stream that
    // logs the turn after streaming finishes. Record the clean userText (not
    // the directive-composed message) — mirroring /api/chat exactly.
    const textStream = zep
      ? baseTextStream.pipeThrough(
          createCaptureStream(async (assistantText) => {
            if (user && userText.trim() && assistantText.trim()) {
              await recordChatTurn(zep, {
                supabaseUser: user,
                threadId: sessionId,
                userText,
                assistantText,
              });
            }
          })
        )
      : baseTextStream;

    return createTextStreamResponse({ textStream });
  }

  // ---- Placeholder: stream a mock reply so the UI works before n8n ----
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
