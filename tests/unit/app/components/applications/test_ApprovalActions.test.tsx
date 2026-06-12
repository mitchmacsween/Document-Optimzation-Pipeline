import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { ApprovalActions } from '@/app/components/applications/ApprovalActions';

describe('ApprovalActions', () => {
  it('renders the Approve & generate button', () => {
    render(
      <ApprovalActions onApprove={jest.fn()} onRequestChanges={jest.fn()} />
    );

    expect(
      screen.getByRole('button', { name: /approve.*generate/i })
    ).toBeInTheDocument();
  });

  it('renders the Request changes button', () => {
    render(
      <ApprovalActions onApprove={jest.fn()} onRequestChanges={jest.fn()} />
    );

    expect(
      screen.getByRole('button', { name: /request changes/i })
    ).toBeInTheDocument();
  });

  it('calls onApprove when the Approve button is clicked', async () => {
    const onApprove = jest.fn();
    const user = userEvent.setup();

    render(
      <ApprovalActions onApprove={onApprove} onRequestChanges={jest.fn()} />
    );

    await user.click(
      screen.getByRole('button', { name: /approve.*generate/i })
    );

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onRequestChanges when the Request changes button is clicked', async () => {
    const onRequestChanges = jest.fn();
    const user = userEvent.setup();

    render(
      <ApprovalActions
        onApprove={jest.fn()}
        onRequestChanges={onRequestChanges}
      />
    );

    await user.click(screen.getByRole('button', { name: /request changes/i }));

    expect(onRequestChanges).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons when disabled prop is true', () => {
    render(
      <ApprovalActions
        onApprove={jest.fn()}
        onRequestChanges={jest.fn()}
        disabled
      />
    );

    expect(
      screen.getByRole('button', { name: /approve.*generate/i })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /request changes/i })
    ).toBeDisabled();
  });

  it('buttons are enabled when disabled prop is false or omitted', () => {
    render(
      <ApprovalActions onApprove={jest.fn()} onRequestChanges={jest.fn()} />
    );

    expect(
      screen.getByRole('button', { name: /approve.*generate/i })
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: /request changes/i })
    ).not.toBeDisabled();
  });
});
