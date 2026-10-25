import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from './render';
import { ApiError } from '@/fsd/features/sentence-training/lib/api-error';
import type { SentencePreparationController } from '@/fsd/features/sentence-training/types';
import { SentencePreparationOption } from '@/fsd/features/sentence-training/ui/sentence-preparation-option/sentence-preparation-option';
import { SentencePreparationSheet } from '@/fsd/features/sentence-training/ui/sentence-preparation-sheet/sentence-preparation-sheet';
import { SentencePreparationNotice } from '@/fsd/features/sentence-training/ui/sentence-preparation-notice/sentence-preparation-notice';

function controller(error: ApiError | null): SentencePreparationController {
    return {
        preparation: null,
        batches: [],
        busy: false,
        error,
        uncertain: false,
        nextOffset: null,
        eligibleCount: null,
        explanationLanguage: undefined,
        loadEligibleCount: vi.fn(),
        start: vi.fn(),
        refresh: vi.fn(),
        stop: vi.fn(),
        resume: vi.fn(),
        loadMore: vi.fn(),
        clear: vi.fn(),
    };
}
function error(code: ApiError['code'], retryAfterSeconds?: number) {
    return new ApiError(503, {
        code,
        correlationId: 'local-test',
        message: 'Preparation unavailable.',
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    });
}
afterEach(() => vi.useRealTimers());
describe('preparation recovery notices', () => {
    it('directs a signed-out learner to sign in without replaying admission', () => {
        const value = controller(error('authentication_required'));
        render(
            <SentencePreparationNotice
                controller={value}
                onStartAgain={vi.fn()}
            />,
        );
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/login',
        );
        expect(
            screen.queryByRole('button', { name: 'Check status' }),
        ).not.toBeInTheDocument();
        expect(value.refresh).not.toHaveBeenCalled();
    });
    it('offers an explicit new preparation and saved library for an unavailable manifest', () => {
        const start = vi.fn();
        const library = vi.fn();
        const value = controller(error('job_not_found'));
        render(
            <SentencePreparationNotice
                controller={value}
                onStartAgain={start}
                onOpenLibrary={library}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Start a new saved-first preparation',
            }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Saved sentences' }),
        );
        expect(start).toHaveBeenCalledOnce();
        expect(library).toHaveBeenCalledOnce();
        expect(value.refresh).not.toHaveBeenCalled();
    });
    it('honors the server cooldown before attempting recovery', () => {
        vi.useFakeTimers();
        const value = controller(error('capacity_unavailable', 2));
        const restart = vi.fn();
        render(
            <SentencePreparationNotice
                controller={value}
                onStartAgain={restart}
            />,
        );
        const retry = screen.getByRole('button', {
            name: 'Start a new saved-first preparation',
        });
        expect(retry).toBeDisabled();
        act(() => vi.advanceTimersByTime(2001));
        expect(retry).toBeEnabled();
        fireEvent.click(retry);
        expect(restart).toHaveBeenCalledOnce();
        expect(value.refresh).not.toHaveBeenCalled();
    });
    it('leaves a revoked dictionary rather than offering unsafe resume', () => {
        render(
            <SentencePreparationNotice
                controller={controller(error('shared_dictionary_not_found'))}
                onStartAgain={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('link', { name: 'Go to my dictionaries' }),
        ).toHaveAttribute('href', '/dictionaries');
        expect(
            screen.queryByRole('button', { name: 'Check status' }),
        ).not.toBeInTheDocument();
    });
    it('opens setup when an expired manifest cannot supply a new direction snapshot', () => {
        const prototype = HTMLDialogElement.prototype;
        const original = Object.getOwnPropertyDescriptor(
            prototype,
            'showModal',
        );
        Object.defineProperty(prototype, 'showModal', {
            configurable: true,
            value(this: HTMLDialogElement) {
                this.setAttribute('open', '');
            },
        });
        const value = controller(error('job_not_found'));
        const restart = vi.fn();
        render(
            <SentencePreparationSheet
                controller={value}
                open
                onClose={vi.fn()}
                onRestartSetup={restart}
                onStart={vi.fn()}
                sourceLanguage='en'
                targetLanguage='fr'
            />,
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Start a new saved-first preparation',
            }),
        );
        expect(value.clear).toHaveBeenCalledOnce();
        expect(restart).toHaveBeenCalledOnce();
        expect(value.start).not.toHaveBeenCalled();
        if (original) Object.defineProperty(prototype, 'showModal', original);
        else Reflect.deleteProperty(prototype, 'showModal');
    });
    it('lets a rejected model admission return to explicit setup after changing preferences', () => {
        const value = controller(error('model_unavailable'));
        const restart = vi.fn();
        const settings = vi.fn();
        render(
            <SentencePreparationNotice
                controller={value}
                onStartAgain={restart}
                onOpenAiSettings={settings}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Open AI settings' }),
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Start a new saved-first preparation',
            }),
        );
        expect(settings).toHaveBeenCalledOnce();
        expect(restart).toHaveBeenCalledOnce();
        expect(value.refresh).not.toHaveBeenCalled();
        expect(value.resume).not.toHaveBeenCalled();
    });
    it('keeps whole-dictionary round planning unknown until its size is known', () => {
        render(
            <SentencePreparationOption
                enabled
                onChange={vi.fn()}
                roundWords={100}
                totalWords={null}
                mode='saved-first'
                controller={controller(null)}
                onView={vi.fn()}
            />,
        );
        expect(screen.getByText('Rounds: …')).toBeVisible();
        expect(screen.queryByText('Rounds: 100')).not.toBeInTheDocument();
    });
});

it('requires an explicit new budget after preparation exhausts its parent allowance', () => {
    const value = controller(null);
    value.continueWithBudget = vi.fn();
    value.preparation = {
        id: '10000000-0000-4000-8000-000000000001',
        dictionaryId: '10000000-0000-4000-8000-000000000002',
        direction: 'source-to-target',
        mode: 'new-only',
        state: 'paused',
        pauseReason: 'budget',
        eligibleCount: 30,
        preparedCount: 10,
        reusedExerciseCount: 0,
        generatedExerciseCount: 10,
        initialBatch: null,
        batchCount: 1,
        activeJobId: null,
        createdAt: '2026-10-22T00:00:00Z',
        updatedAt: '2026-10-22T00:01:00Z',
        requiresNewBudget: true,
        remainingOutputTokens: 0,
        billing: {
            state: 'charged',
            heldCredits: '40',
            chargedCredits: '0.2',
            measurement: 'measured',
        },
    };
    render(
        <SentencePreparationSheet
            controller={value}
            open
            onClose={vi.fn()}
            onRestartSetup={vi.fn()}
            onStart={vi.fn()}
            sourceLanguage='en'
            targetLanguage='es'
        />,
    );
    expect(screen.queryByText(/Charged:/)).not.toBeInTheDocument();
    expect(value.continueWithBudget).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getAllByRole('button', {
            name: 'Continue with a new budget',
        })[0]!,
    );
    expect(value.continueWithBudget).toHaveBeenCalledOnce();
    expect(value.resume).not.toHaveBeenCalled();
});
