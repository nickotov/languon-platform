import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { initialSentenceState } from '@/fsd/features/sentence-training/model/sentence-session';
import { ApiError } from '@/fsd/features/sentence-training/lib/api-error';
import { SentencePracticeSession } from '@/fsd/features/sentence-training/ui/sentence-practice-session/sentence-practice-session';
import { SentenceSetup } from '@/fsd/features/sentence-training/ui/sentence-setup/sentence-setup';
import type {
    SentenceSessionController,
    SentenceSetupController,
} from '@/fsd/features/sentence-training/types';

const error = new ApiError(402, {
    code: 'ai_credits_exhausted',
    message: 'No credits',
    correlationId: 'test',
});
function controller(
    patch: Partial<SentenceSessionController> = {},
): SentenceSessionController {
    return {
        ...initialSentenceState(),
        phase: 'exercise',
        configuration: {
            direction: 'source-to-target',
            mode: 'saved-first',
            scope: { type: 'all' },
            explanationLanguage: 'fr',
        },
        exercise: {
            id: '10000000-0000-4000-8000-000000000001',
            dictionaryId: '10000000-0000-4000-8000-000000000002',
            direction: 'source-to-target',
            sourceLanguage: 'en',
            targetLanguage: 'es',
            sourceText: 'Hello',
            segments: [
                {
                    id: 'segment-1',
                    start: 0,
                    end: 5,
                    text: 'Hello',
                    target: null,
                },
            ],
            hints: [],
            generationPolicyVersion: 1,
            createdAt: '2026-10-05T00:00:00.000Z',
        },
        start: vi.fn(),
        changeMode: vi.fn(),
        restartReview: vi.fn(),
        next: vi.fn(),
        check: vi.fn(),
        revealReference: vi.fn(),
        retry: vi.fn(),
        cancel: vi.fn(),
        setDraft: vi.fn(),
        toggleHint: vi.fn(),
        reset: vi.fn(),
        retryProgress: vi.fn(),
        ...patch,
    };
}
function practice(c: SentenceSessionController, close = vi.fn()) {
    render(
        <I18nProvider locale='en' messages={en}>
            <SentencePracticeSession controller={c} open onClose={close} />
        </I18nProvider>,
    );
    return close;
}
beforeEach(() => {
    // jsdom has no native dialog implementation; the production component and
    // all its accessible controls remain real, with only platform calls stubbed.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
        configurable: true,
        value: function (this: HTMLDialogElement) {
            this.open = true;
        },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true,
        value: function (this: HTMLDialogElement) {
            this.open = false;
        },
    });
});
afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    vi.unstubAllGlobals();
});
describe('sentence review regressions', () => {
    it('retains an over-limit Unicode draft, explains the limit and never admits a paid check', () => {
        const draft = '😀'.repeat(4001);
        const c = controller({ draft });
        practice(c);
        expect(screen.getByRole('textbox')).toHaveValue(draft);
        expect(screen.getByText('4001 / 4000')).toBeVisible();
        expect(
            screen.getByText('Your answer is over the 4,000-character limit.'),
        ).toBeVisible();
        const check = screen.getByRole('button', { name: 'Check with AI' });
        expect(check).toBeDisabled();
        fireEvent.click(check);
        expect(c.check).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', {
                name: 'Show reference answer — free',
            }),
        ).toBeEnabled();
    });
    it('asks before discarding a draft whose AI request failed before a stored result', () => {
        const close = practice(
            controller({ draft: 'Hola', submittedAnswer: 'Hola', error }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Close practice' }));
        expect(
            screen.getByRole('dialog', { name: 'Leave practice?' }),
        ).toBeVisible();
        expect(close).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Keep practising' }),
        );
        expect(screen.getByRole('textbox')).toHaveValue('Hola');
        fireEvent.click(screen.getByRole('button', { name: 'Close practice' }));
        fireEvent.click(
            screen.getByRole('button', { name: 'Leave practice', exact: true }),
        );
        expect(close).toHaveBeenCalledOnce();
    });
    it('does not invent progress totals and offers a free retry without losing the answer', () => {
        const c = controller({
            draft: 'Hola',
            progressError: new ApiError(503, {
                code: 'service_unavailable',
                message: 'Unavailable',
                correlationId: 'test',
            }),
        });
        practice(c);
        expect(screen.queryByText(/0 entries seen/)).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Your progress could not be loaded. Your draft is kept.',
            ),
        ).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(c.retryProgress).toHaveBeenCalledOnce();
        expect(c.check).not.toHaveBeenCalled();
        expect(screen.getByRole('textbox')).toHaveValue('Hola');
        expect(
            screen.getByText(
                'English → Spanish · Saved first · Feedback in French',
            ),
        ).toBeVisible();
    });
    it('shows stopping after cancellation is accepted and prevents duplicate cancellation', () => {
        const c = controller({
            busy: true,
            job: {
                id: '10000000-0000-4000-8000-000000000003',
                kind: 'sentence-check',
                state: 'running',
                cancellationRequested: true,
                attemptCount: 1,
                failureCode: null,
                result: null,
                createdAt: '2026-10-05T00:00:00.000Z',
                updatedAt: '2026-10-05T00:00:00.000Z',
            },
        });
        practice(c);
        const stopping = screen.getByRole('button', { name: /Stopping/ });
        expect(stopping).toBeDisabled();
        fireEvent.click(stopping);
        expect(c.cancel).not.toHaveBeenCalled();
    });
    it('retries the first entry page rather than requesting a nonexistent next cursor', () => {
        const c: SentenceSetupController = {
            configuration: {
                direction: 'source-to-target',
                mode: 'saved-first',
                scope: { type: 'manual', entryIds: [] },
            },
            setConfiguration: vi.fn(),
            entries: [],
            search: '',
            setSearch: vi.fn(),
            selectedEntryIds: [],
            setSelectedEntryIds: vi.fn(),
            prepared: null,
            loading: false,
            entriesLoading: false,
            error: null,
            entriesError: new ApiError(503, {
                code: 'service_unavailable',
                message: 'Unavailable',
                correlationId: 'test',
            }),
            hasMore: false,
            loadMore: vi.fn(),
            refresh: vi.fn(),
            invalidate: vi.fn(),
        };
        render(
            <I18nProvider locale='en' messages={en}>
                <SentenceSetup
                    controller={c}
                    open
                    onClose={vi.fn()}
                    onStart={vi.fn()}
                    sourceLanguage='en'
                    targetLanguage='es'
                />
            </I18nProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(c.refresh).toHaveBeenCalledOnce();
        expect(c.loadMore).not.toHaveBeenCalled();
    });
});
