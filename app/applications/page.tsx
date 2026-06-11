'use client';

import { useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { generateId } from '@/lib/utils';
import type { Toggles } from '@/lib/applications/schema';
import { PageHero } from '../components/PageHero';
import { PageShell } from '../components/PageShell';
import { ChatMessages } from '../components/chat/ChatMessages';
import { ActionToggles } from '../components/applications/ActionToggles';
import { ApprovalActions } from '../components/applications/ApprovalActions';

export default function ApplicationsPage() {
  const [sessionId] = useState(() => generateId());
  const [input, setInput] = useState('');
  const [toggles, setToggles] = useState<Toggles>({
    research: true,
    resume: true,
    cover: false,
  });

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: '/api/applications/chat',
        body: { sessionId, toggles },
      }),
    [sessionId, toggles]
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isBusy = status === 'submitted' || status === 'streaming';
  const showApproval = !isBusy && messages.some((m) => m.role === 'assistant');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="n8n · Job Applications"
        title={
          <>
            Job{' '}
            <span className="font-serif font-normal italic text-primary">
              Applications
            </span>
          </>
        }
        subtitle="Paste a job description and choose which outputs to generate — research, resume tailoring, or a cover letter — then chat with your n8n agent."
      />

      <Card className="flex h-[70vh] flex-col border-2 border-foreground rounded-2xl shadow-hard">
        <CardContent className="flex-1 overflow-y-auto space-y-4 pt-6">
          <ChatMessages messages={messages} status={status} error={error} />
        </CardContent>

        <div className="border-t p-4 space-y-3">
          {showApproval && (
            <ApprovalActions
              onApprove={() =>
                sendMessage({
                  text: 'Approved — please generate the documents now.',
                })
              }
              onRequestChanges={() => setInput('Please revise the strategy: ')}
              disabled={isBusy}
            />
          )}

          <ActionToggles toggles={toggles} onChange={setToggles} />

          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              disabled={isBusy}
              aria-label="Message"
            />
            <Button type="submit" disabled={isBusy || !input.trim()}>
              <Send />
              Send
            </Button>
          </form>
        </div>
      </Card>
    </PageShell>
  );
}
