import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockOrder = jest.fn();
const mockSelect = jest.fn().mockReturnValue({ order: mockOrder });
const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
const mockOn = jest.fn().mockReturnThis();
const mockSubscribe = jest.fn().mockReturnValue('channel');
const mockChannel = jest
  .fn()
  .mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

import { ProgressTimeline } from '@/app/components/applications/ProgressTimeline';

beforeEach(() => {
  jest.clearAllMocks();
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({ select: mockSelect });
  mockChannel.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
  mockOn.mockReturnThis();
});

describe('ProgressTimeline', () => {
  it('shows an empty state when there are no runs', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    render(<ProgressTimeline />);
    await waitFor(() =>
      expect(screen.getByText(/no job runs yet/i)).toBeInTheDocument()
    );
  });

  it('renders job runs from the initial load', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: 'run-1',
          user_id: 'u',
          company: 'Stripe',
          mode: 'oneoff',
          toggles: {},
          status: 'running',
          current_step: 'submitted',
          iteration: 1,
          resume_doc_url: null,
          cover_doc_url: null,
          error_message: null,
          created_at: '2026-06-10T12:00:00Z',
          updated_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    render(<ProgressTimeline />);
    await waitFor(() => expect(screen.getByText('Stripe')).toBeInTheDocument());
    expect(mockFrom).toHaveBeenCalledWith('job_runs');
    expect(mockChannel).toHaveBeenCalledWith('job_runs_changes');
    expect(mockSubscribe).toHaveBeenCalled();
  });
});
