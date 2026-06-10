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
