import '@testing-library/jest-dom';

// Track calls to from('table').delete().eq(...)
const mockEqHistory = jest.fn().mockResolvedValue({ error: null });
const mockDeleteHistory = jest.fn().mockReturnValue({ eq: mockEqHistory });

const mockEqSessions = jest.fn().mockResolvedValue({ error: null });
const mockDeleteSessions = jest.fn().mockReturnValue({ eq: mockEqSessions });

const mockFrom = jest.fn().mockImplementation((table: string) => {
  if (table === 'n8n_chat_histories') {
    return { delete: mockDeleteHistory };
  }
  if (table === 'n8n_chat_sessions') {
    return { delete: mockDeleteSessions };
  }
  return { delete: jest.fn() };
});

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { deleteSession } from '@/lib/applications/sessions';

describe('deleteSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-configure because clearAllMocks clears return values too
    mockDeleteHistory.mockReturnValue({ eq: mockEqHistory });
    mockDeleteSessions.mockReturnValue({ eq: mockEqSessions });
    mockEqHistory.mockResolvedValue({ error: null });
    mockEqSessions.mockResolvedValue({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'n8n_chat_histories') {
        return { delete: mockDeleteHistory };
      }
      if (table === 'n8n_chat_sessions') {
        return { delete: mockDeleteSessions };
      }
      return { delete: jest.fn() };
    });
  });

  it('deletes history rows for the given session_id', async () => {
    await deleteSession('s1');
    expect(mockFrom).toHaveBeenCalledWith('n8n_chat_histories');
    expect(mockDeleteHistory).toHaveBeenCalled();
    expect(mockEqHistory).toHaveBeenCalledWith('session_id', 's1');
  });

  it('deletes the session row for the given session_id', async () => {
    await deleteSession('s1');
    expect(mockFrom).toHaveBeenCalledWith('n8n_chat_sessions');
    expect(mockDeleteSessions).toHaveBeenCalled();
    expect(mockEqSessions).toHaveBeenCalledWith('session_id', 's1');
  });

  it('deletes history rows before the session row', async () => {
    const callOrder: string[] = [];
    mockEqHistory.mockImplementation(() => {
      callOrder.push('history');
      return Promise.resolve({ error: null });
    });
    mockEqSessions.mockImplementation(() => {
      callOrder.push('sessions');
      return Promise.resolve({ error: null });
    });

    await deleteSession('s1');

    expect(callOrder).toEqual(['history', 'sessions']);
  });
});
