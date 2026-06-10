import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { JobSubmitForm } from '@/app/components/applications/JobSubmitForm';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: {} }),
    });
  // jsdom lacks crypto.randomUUID in some versions; stub it deterministically.
  Object.defineProperty(global, 'crypto', {
    value: { randomUUID: () => '11111111-1111-1111-1111-111111111111' },
    configurable: true,
  });
});

describe('JobSubmitForm', () => {
  it('disables submit until a valid JD is entered', async () => {
    render(<JobSubmitForm />);
    const button = screen.getByRole('button', { name: /generate/i });
    expect(button).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText(/job description/i),
      'A sufficiently long job description for a PM role.'
    );
    expect(button).toBeEnabled();
  });

  it('POSTs to /api/applications with the JD and toggles', async () => {
    render(<JobSubmitForm />);
    await userEvent.type(
      screen.getByLabelText(/job description/i),
      'A sufficiently long job description for a PM role.'
    );
    await userEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/applications');
    const body = JSON.parse(init.body);
    expect(body.jd).toContain('PM role');
    expect(body.toggles).toEqual({
      research: true,
      resume: true,
      cover: false,
    });
    expect(body.sessionId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('shows an error message when the request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });
    render(<JobSubmitForm />);
    await userEvent.type(
      screen.getByLabelText(/job description/i),
      'A sufficiently long job description for a PM role.'
    );
    await userEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() =>
      expect(screen.getByText(/server error/i)).toBeInTheDocument()
    );
  });
});
