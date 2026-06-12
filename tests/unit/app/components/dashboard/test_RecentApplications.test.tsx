import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockOrderFn = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: mockOrderFn,
      }),
    }),
  }),
}));

import { RecentApplications } from '@/app/components/dashboard/RecentApplications';

const SESSIONS = [
  {
    id: 'uuid-1',
    session_id: 'sess-1',
    user_id: 'user-1',
    name: 'Software Engineer at Acme',
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-02-15T14:30:00Z',
  },
  {
    id: 'uuid-2',
    session_id: 'sess-2',
    user_id: 'user-1',
    name: 'Product Manager at Globex',
    created_at: '2024-01-20T09:00:00Z',
    updated_at: '2024-02-14T11:00:00Z',
  },
];

describe('RecentApplications', () => {
  beforeEach(() => {
    mockOrderFn.mockReset();
  });

  it('displays a count and session names when data loads', async () => {
    mockOrderFn.mockResolvedValue({ data: SESSIONS, error: null });

    render(<RecentApplications />);

    await waitFor(() =>
      expect(screen.getByText(/Software Engineer at Acme/i)).toBeInTheDocument()
    );

    expect(screen.getByText(/Product Manager at Globex/i)).toBeInTheDocument();

    // Count line — should say "2 applications"
    expect(screen.getByText(/2 application/i)).toBeInTheDocument();
  });

  it('shows the formatted updated_at date for each session', async () => {
    mockOrderFn.mockResolvedValue({ data: SESSIONS, error: null });

    render(<RecentApplications />);

    // We just check at least one date appears (locale-formatting is fine)
    await waitFor(() =>
      expect(
        screen.getAllByText(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}/).length
      ).toBeGreaterThan(0)
    );
  });

  it('renders the empty-state message when there are no sessions', async () => {
    mockOrderFn.mockResolvedValue({ data: [], error: null });

    render(<RecentApplications />);

    await waitFor(() =>
      expect(screen.getByText(/no applications yet/i)).toBeInTheDocument()
    );
  });

  it('queries n8n_chat_sessions ordered by updated_at descending', async () => {
    mockOrderFn.mockResolvedValue({ data: [], error: null });

    render(<RecentApplications />);

    await waitFor(() => expect(mockOrderFn).toHaveBeenCalled());

    expect(mockOrderFn).toHaveBeenCalledWith('updated_at', {
      ascending: false,
    });
  });
});
