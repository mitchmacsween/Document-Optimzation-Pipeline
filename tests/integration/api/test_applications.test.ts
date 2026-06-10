/**
 * @jest-environment node
 */

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
  sessionId: '11111111-1111-4111-8111-111111111111',
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
