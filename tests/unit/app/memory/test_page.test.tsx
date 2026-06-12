import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Stub Navigation (client component that calls Supabase auth).
jest.mock('@/app/components/Navigation', () => ({
  __esModule: true,
  default: () => <nav data-testid="nav" />,
}));

// Stub the two interactive cards so this test stays focused on the page
// shell — each card has its own dedicated test file.
jest.mock('@/app/memory/components/UserSummaryCard', () => ({
  UserSummaryCard: () => (
    <div data-testid="user-summary-card">UserSummaryCard</div>
  ),
}));

jest.mock('@/app/memory/components/GraphSearchExplorer', () => ({
  GraphSearchExplorer: () => (
    <div data-testid="graph-search-explorer">GraphSearchExplorer</div>
  ),
}));

import MemoryPage from '@/app/memory/page';

describe('Memory page', () => {
  beforeEach(() => {
    render(<MemoryPage />);
  });

  it('renders the hero heading about remembering you', () => {
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders the UserSummaryCard', () => {
    expect(screen.getByTestId('user-summary-card')).toBeInTheDocument();
  });

  it('renders the GraphSearchExplorer', () => {
    expect(screen.getByTestId('graph-search-explorer')).toBeInTheDocument();
  });

  it('does NOT render the old explainer sections', () => {
    expect(
      screen.queryByRole('heading', { name: /what is a knowledge graph/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /long-term memory/i })
    ).not.toBeInTheDocument();
  });
});
