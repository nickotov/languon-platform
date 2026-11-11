import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EndSessionDialog } from '@/fsd/features/flashcard-training/ui/end-session-dialog/end-session-dialog';
import { render } from './render';

it('keeps Continue and Finish distinct and retains the queue-loss explanation', () => {
    const onKeep = vi.fn();
    const onEnd = vi.fn();
    render(
        <EndSessionDialog
            open
            signedIn
            saving={false}
            onKeep={onKeep}
            onEnd={onEnd}
        />,
    );

    expect(
        screen.getByText(/card queue and Undo cannot be resumed/),
    ).toBeVisible();

    fireEvent.click(
        screen.getByRole('button', { name: 'Continue', exact: true }),
    );

    expect(onKeep).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole('button', { name: 'Finish', exact: true }),
    );

    expect(onEnd).toHaveBeenCalledOnce();
});
