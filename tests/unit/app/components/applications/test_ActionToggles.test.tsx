import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { ActionToggles } from '@/app/components/applications/ActionToggles';
import type { Toggles } from '@/lib/applications/schema';

const defaultToggles: Toggles = {
  research: false,
  resume: false,
  cover: false,
};

describe('ActionToggles', () => {
  it('renders three labelled checkboxes', () => {
    render(<ActionToggles toggles={defaultToggles} onChange={jest.fn()} />);

    expect(screen.getByLabelText(/research/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/resume/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cover letter/i)).toBeInTheDocument();
  });

  it('reflects the checked state from props', () => {
    render(
      <ActionToggles
        toggles={{ research: true, resume: false, cover: true }}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByLabelText(/research/i)).toBeChecked();
    expect(screen.getByLabelText(/resume/i)).not.toBeChecked();
    expect(screen.getByLabelText(/cover letter/i)).toBeChecked();
  });

  it('calls onChange with research flipped when the Research checkbox is clicked', async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <ActionToggles
        toggles={{ research: false, resume: true, cover: false }}
        onChange={handleChange}
      />
    );

    await user.click(screen.getByLabelText(/research/i));

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith({
      research: true,
      resume: true,
      cover: false,
    });
  });

  it('calls onChange with resume flipped when the Resume checkbox is clicked', async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <ActionToggles
        toggles={{ research: false, resume: false, cover: false }}
        onChange={handleChange}
      />
    );

    await user.click(screen.getByLabelText(/resume/i));

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith({
      research: false,
      resume: true,
      cover: false,
    });
  });

  it('calls onChange with cover flipped when the Cover letter checkbox is clicked', async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <ActionToggles
        toggles={{ research: true, resume: true, cover: false }}
        onChange={handleChange}
      />
    );

    await user.click(screen.getByLabelText(/cover letter/i));

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith({
      research: true,
      resume: true,
      cover: true,
    });
  });
});
