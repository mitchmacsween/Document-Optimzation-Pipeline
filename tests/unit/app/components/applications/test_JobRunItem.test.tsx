import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { JobRunItem } from '@/app/components/applications/JobRunItem';
import type { JobRun } from '@/types/supabase';

const baseRun: JobRun = {
  id: 'run-1',
  user_id: 'user-123',
  company: 'Stripe',
  mode: 'oneoff',
  toggles: { research: true, resume: true, cover: false },
  status: 'writing',
  current_step: 'Strategy',
  iteration: 1,
  resume_doc_url: null,
  cover_doc_url: null,
  error_message: null,
  created_at: '2026-06-10T12:00:00Z',
  updated_at: '2026-06-10T12:00:00Z',
};

describe('JobRunItem', () => {
  it('shows the company, status, and current step', () => {
    render(<JobRunItem run={baseRun} />);
    expect(screen.getByText('Stripe')).toBeInTheDocument();
    expect(screen.getByText(/writing/i)).toBeInTheDocument();
    expect(screen.getByText(/Strategy/)).toBeInTheDocument();
  });

  it('renders resume and cover-letter doc links when present', () => {
    render(
      <JobRunItem
        run={{
          ...baseRun,
          status: 'done',
          resume_doc_url: 'https://docs.google.com/resume',
          cover_doc_url: 'https://docs.google.com/cover',
        }}
      />
    );
    expect(screen.getByRole('link', { name: /resume/i })).toHaveAttribute(
      'href',
      'https://docs.google.com/resume'
    );
    expect(screen.getByRole('link', { name: /cover letter/i })).toHaveAttribute(
      'href',
      'https://docs.google.com/cover'
    );
  });

  it('shows the error message when status is error', () => {
    render(
      <JobRunItem
        run={{
          ...baseRun,
          status: 'error',
          error_message: 'extraction failed',
        }}
      />
    );
    expect(screen.getByText(/extraction failed/i)).toBeInTheDocument();
  });
});
