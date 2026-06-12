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
    // The toggles are composed into the message as a plain-English directive so
    // the agent reliably honors them (cover is off here → must be told NOT to).
    expect(sent.message).toContain(
      'ONLY perform: company research, resume tailoring'
    );
    expect(sent.message).toContain(
      'Do NOT perform or call tools for: cover letter'
    );
    expect(res.status).toBe(200);
  });

  it('returns 502 when the webhook is unreachable', async () => {
    process.env.N8N_JOBMANAGER_WEBHOOK_URL = 'https://n8n.example/webhook/x';
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const res = await POST(req(validBody));
    expect(res.status).toBe(502);
  });

  it('returns 502 when the webhook responds non-OK', async () => {
    process.env.N8N_JOBMANAGER_WEBHOOK_URL = 'https://n8n.example/webhook/x';
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, body: null });
    const res = await POST(req(validBody));
    expect(res.status).toBe(502);
  });

  it('defaults toggles to research+resume when omitted', async () => {
    process.env.N8N_JOBMANAGER_WEBHOOK_URL = 'https://n8n.example/webhook/x';
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"type":"item","content":"hi"}\n'));
        c.close();
      },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, body: stream });
    const { toggles: _toggles, ...bodyNoToggles } = validBody;
    const res = await POST(req(bodyNoToggles));
    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sent.toggles).toEqual({
      research: true,
      resume: true,
      cover: false,
    });
    expect(res.status).toBe(200);
  });
});
