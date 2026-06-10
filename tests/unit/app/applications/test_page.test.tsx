import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ProgressTimeline and Navigation use the Supabase browser client — stub it.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
    from: () => ({
      select: () => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe: () => 'channel',
    }),
    removeChannel: jest.fn(),
  }),
}));

import ApplicationsPage from '@/app/applications/page';

describe('ApplicationsPage', () => {
  it('renders the hero title and the submit form', () => {
    render(<ApplicationsPage />);
    expect(
      screen.getByRole('heading', { name: /job application manager/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/job description/i)).toBeInTheDocument();
  });
});
