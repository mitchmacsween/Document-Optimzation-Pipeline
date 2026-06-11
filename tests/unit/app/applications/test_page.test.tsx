import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Stub AI SDK + transport — ESM packages that Jest can't transform from node_modules.
const mockSendMessage = jest.fn();
jest.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: mockSendMessage,
    setMessages: jest.fn(),
    status: 'ready',
    error: undefined,
  }),
}));
jest.mock('ai', () => ({
  TextStreamChatTransport: class {
    constructor() {}
  },
}));

// Stub react-markdown / remark-gfm (ESM).
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }));

// Navigation reads auth state via the Supabase browser client.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  }),
}));

import ApplicationsPage from '@/app/applications/page';

describe('ApplicationsPage', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  it('renders a heading that matches /job applications/i', () => {
    render(<ApplicationsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /job applications/i })
    ).toBeInTheDocument();
  });

  it('renders the message input', () => {
    render(<ApplicationsPage />);

    // Input is labelled "Message" via aria-label (mirrors the chat page).
    expect(
      screen.getByRole('textbox', { name: /message/i })
    ).toBeInTheDocument();
  });

  it('renders the three action-toggle checkboxes', () => {
    render(<ApplicationsPage />);

    expect(screen.getByLabelText(/research/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/resume/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cover letter/i)).toBeInTheDocument();
  });

  it('research and resume toggles start checked; cover starts unchecked', () => {
    render(<ApplicationsPage />);

    expect(screen.getByLabelText(/research/i)).toBeChecked();
    expect(screen.getByLabelText(/resume/i)).toBeChecked();
    expect(screen.getByLabelText(/cover letter/i)).not.toBeChecked();
  });

  it('send button is disabled when the input is empty', () => {
    render(<ApplicationsPage />);

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('sends the message when the form is submitted with text', async () => {
    const user = userEvent.setup();
    render(<ApplicationsPage />);

    await user.type(
      screen.getByRole('textbox', { name: /message/i }),
      'Tell me about this job'
    );
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(mockSendMessage).toHaveBeenCalledWith({
      text: 'Tell me about this job',
    });
  });
});
