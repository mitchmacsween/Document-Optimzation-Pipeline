import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Stub AI SDK + transport — ESM packages that Jest can't transform from node_modules.
const mockSendMessage = jest.fn();
const mockSetMessages = jest.fn();
jest.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: mockSendMessage,
    setMessages: mockSetMessages,
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
// ChatSessionSidebar also calls from('n8n_chat_sessions').select(...).order(...)
// and sets up a Realtime channel. We stub all of this.
const mockRemoveChannel = jest.fn();
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
    from: () => ({
      select: () => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    channel: () => ({
      on: function () {
        return this;
      },
      subscribe: jest.fn(),
    }),
    removeChannel: mockRemoveChannel,
  }),
}));

import HomePage from '@/app/page';

describe('HomePage', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSetMessages.mockReset();
    mockRemoveChannel.mockReset();
  });

  it('does not show the approve button when there are no messages', () => {
    render(<HomePage />);

    // messages: [] → no assistant message → showApproval is false
    expect(
      screen.queryByRole('button', { name: /approve/i })
    ).not.toBeInTheDocument();
  });

  it('renders a heading that matches /job applications/i', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: /job applications/i })
    ).toBeInTheDocument();
  });

  it('renders the message input', () => {
    render(<HomePage />);

    // Input is labelled "Message" via aria-label.
    expect(
      screen.getByRole('textbox', { name: /message/i })
    ).toBeInTheDocument();
  });

  it('renders the three action-toggle checkboxes', () => {
    render(<HomePage />);

    expect(screen.getByLabelText(/research/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/resume/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cover letter/i)).toBeInTheDocument();
  });

  it('research and resume toggles start checked; cover starts unchecked', () => {
    render(<HomePage />);

    expect(screen.getByLabelText(/research/i)).toBeChecked();
    expect(screen.getByLabelText(/resume/i)).toBeChecked();
    expect(screen.getByLabelText(/cover letter/i)).not.toBeChecked();
  });

  it('send button is disabled when the input is empty', () => {
    render(<HomePage />);

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('sends the message when the form is submitted with text', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    await user.type(
      screen.getByRole('textbox', { name: /message/i }),
      'Tell me about this job'
    );
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(mockSendMessage).toHaveBeenCalledWith({
      text: 'Tell me about this job',
    });
  });

  it('renders the session sidebar with a "New chat" button', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('button', { name: /new chat/i })
    ).toBeInTheDocument();
  });
});
