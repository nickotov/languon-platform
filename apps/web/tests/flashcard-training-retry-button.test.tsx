import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/fsd/features/flashcard-training/lib/api-error';
import { RetryButton } from '@/fsd/features/flashcard-training/ui/retry-button/retry-button';
import { render } from './render';

afterEach(() => vi.useRealTimers());

describe('training retry deadline', () => {
    it('remounting a retry control cannot extend the original server cooldown', () => {
        vi.useFakeTimers();
        const error = new ApiError(429, {
            code: 'rate_limited',
            correlationId: 'test',
            message: 'Wait',
            retryAfterSeconds: 2,
        });
        const onRetry = vi.fn();
        const first = render(<RetryButton error={error} onRetry={onRetry} />);
        expect(
            screen.getByRole('button', { name: 'Retry in 2s' }),
        ).toBeDisabled();
        act(() => vi.advanceTimersByTime(1_500));
        first.unmount();
        const second = render(<RetryButton error={error} onRetry={onRetry} />);
        expect(
            screen.getByRole('button', { name: 'Retry in 1s' }),
        ).toBeDisabled();
        act(() => vi.advanceTimersByTime(500));
        const retry = screen.getByRole('button', { name: 'Retry' });
        expect(retry).toBeEnabled();
        fireEvent.click(retry);
        expect(onRetry).toHaveBeenCalledOnce();
        second.unmount();
    });
    it('an explicit operation deadline takes precedence over the error deadline', () => {
        vi.useFakeTimers();
        const error = new ApiError(429, {
            code: 'rate_limited',
            correlationId: 'test',
            message: 'Wait',
            retryAfterSeconds: 10,
        });
        const view = render(
            <RetryButton
                error={error}
                retryAt={Date.now() + 1_000}
                onRetry={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Retry in 1s' }),
        ).toBeDisabled();
        act(() => vi.advanceTimersByTime(1_000));
        expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
        view.unmount();
    });
});
