import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/fsd/shared/i18n';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import { SentenceReferenceComparison } from '@/fsd/features/sentence-training/ui/sentence-reference-comparison/sentence-reference-comparison';
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
const originalShowModal = {
    configurable: true,
    writable: true,
    value: HTMLDialogElement.prototype.showModal,
};
const originalClose = {
    configurable: true,
    writable: true,
    value: HTMLDialogElement.prototype.close,
};

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
    cleanup();
    Object.defineProperty(
        HTMLDialogElement.prototype,
        'showModal',
        originalShowModal,
    );
    Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    vi.unstubAllGlobals();
});
describe('sentence review regressions', () => {
    it('retains an over-limit Unicode draft, explains the limit and never admits a paid check', () => {
        const draft = '😀'.repeat(4001);
        const c = controller({ draft, recompare: vi.fn() });
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
                name: 'Compare with reference — free',
            }),
        ).toBeEnabled();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Compare with reference — free',
            }),
        );
        expect(c.recompare).toHaveBeenCalledOnce();
        expect(c.revealReference).not.toHaveBeenCalled();
        expect(c.check).not.toHaveBeenCalled();
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
        const notice = screen.getByRole('status');
        expect(notice).toHaveTextContent('Stopping…');
        expect(notice).toHaveTextContent(
            'Work that already started may still use credits.',
        );
        expect(notice).not.toHaveTextContent('Checking your answer');
        fireEvent.click(stopping);
        expect(c.cancel).not.toHaveBeenCalled();
    });
    it('explains the batch cap and allows replacing a word without silently overfilling', () => {
        const entries = Array.from({ length: 101 }, (_, index) => ({
            entryId: `entry-${index}`,
            source: `source ${index}`,
            translation: `translation ${index}`,
        }));
        const selectedEntryIds = entries
            .slice(0, 100)
            .map((entry) => entry.entryId);
        const c: SentenceSetupController = {
            configuration: {
                direction: 'target-to-source',
                mode: 'saved-first',
                scope: { type: 'manual', entryIds: selectedEntryIds },
            },
            setConfiguration: vi.fn(),
            setSearch: vi.fn(),
            setSelectedEntryIds: vi.fn(),
            loadMore: vi.fn(),
            refresh: vi.fn(),
            invalidate: vi.fn(),
            prepared: null,
            loading: false,
            error: null,
            entries: [entries[0]!, entries[100]!],
            entriesLoading: false,
            entriesError: null,
            hasMore: false,
            search: '',
            selectedEntryIds,
        };
        const setup = (controller: SentenceSetupController) => (
            <I18nProvider locale='en' messages={en}>
                <SentenceSetup
                    controller={controller}
                    open
                    onClose={vi.fn()}
                    onStart={vi.fn()}
                    sourceLanguage='fr'
                    targetLanguage='ru'
                />
            </I18nProvider>
        );
        const view = render(setup(c));
        expect(
            screen.getByText(/Each round uses up to 100 words/),
        ).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Batch limit reached',
        );
        expect(
            screen.getByRole('checkbox', {
                name: 'source 100 → translation 100',
            }),
        ).toBeDisabled();
        expect(
            screen.getByRole('checkbox', { name: 'source 0 → translation 0' }),
        ).toBeEnabled();
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'source 0 → translation 0' }),
        );
        expect(c.setSelectedEntryIds).toHaveBeenLastCalledWith(
            selectedEntryIds.slice(1),
        );
        view.rerender(
            setup({ ...c, selectedEntryIds: selectedEntryIds.slice(1) }),
        );
        expect(
            screen.getByRole('button', { name: 'Select all shown' }),
        ).toBeDisabled();
        const replacement = screen.getByRole('checkbox', {
            name: 'source 100 → translation 100',
        });
        expect(replacement).toBeEnabled();
        fireEvent.click(replacement);
        expect(c.setSelectedEntryIds).toHaveBeenLastCalledWith([
            ...selectedEntryIds.slice(1),
            'entry-100',
        ]);
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

it('offers one actionable generation choice after saved-review exhaustion', () => {
    const changeMode = vi.fn();
    practice(
        controller({
            phase: 'empty',
            exercise: null,
            emptyReason: 'review-exhausted',
            changeMode,
        }),
    );
    expect(
        screen.queryByRole('button', {
            name: 'Generate new examples',
            exact: true,
        }),
    ).toBeNull();
    fireEvent.click(
        screen.getByRole('button', {
            name: 'Generate new sentences',
            exact: true,
        }),
    );
    expect(changeMode).toHaveBeenCalledWith('new-only');
});

it('guards leaving while an empty-draft reference review is still pending', () => {
    const close = practice(controller({ draft: '', referenceLoading: true }));
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close practice' }));
    expect(
        screen.getByRole('dialog', { name: 'Leave practice?' }),
    ).toBeVisible();
    expect(
        screen.getByText(/An AI task or reference review already started/),
    ).toBeVisible();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep practising' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(close).not.toHaveBeenCalled();
});

it('localizes completed rating labels and comparison details in Russian', () => {
    const c = controller({ phase: 'completed' });
    c.counts.checked = 1;
    c.counts.ratings.perfect = 1;
    render(
        <I18nProvider locale='ru' messages={ru}>
            <SentencePracticeSession controller={c} open onClose={vi.fn()} />
        </I18nProvider>,
    );
    expect(screen.getByText('Проверено ИИ')).toBeVisible();
    expect(screen.getByText('Идеально')).toBeVisible();
    expect(screen.getByText('Хорошо')).toBeVisible();
    expect(screen.getByText('Неплохо')).toBeVisible();
    expect(screen.queryByText('practiseAgainLater')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    render(
        <I18nProvider locale='ru' messages={ru}>
            <SentenceReferenceComparison
                exercise={{ targetLanguage: 'fr' }}
                comparison={{
                    kind: 'match',
                    answer: 'Bonjour!',
                    reference: 'bonjour',
                    normalizedAnswer: 'bonjour',
                    normalizedReference: 'bonjour',
                    ignored: ['case', 'punctuation'],
                }}
            />
        </I18nProvider>,
    );
    expect(screen.getByText('Не учитываются:')).toBeVisible();
});

it('keeps completed results visible with queued fresh work and cancellation', () => {
    const c = controller({
        phase: 'completed',
        busy: true,
        job: {
            id: '10000000-0000-4000-8000-000000000003',
            kind: 'sentence-generation',
            state: 'queued',
            cancellationRequested: false,
            attemptCount: 0,
            createdAt: '2026-10-05T00:00:00.000Z',
            updatedAt: '2026-10-05T00:00:00.000Z',
            failureCode: null,
            result: null,
        },
    });
    c.counts.presented = 3;
    practice(c);
    expect(
        screen.getByRole('heading', { name: 'Round complete' }),
    ).toBeVisible();
    expect(screen.getByText('Examples presented')).toBeVisible();
    expect(
        screen.getByText('Preparing a sentence — waiting to start'),
    ).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
        screen.getByRole('button', { name: 'Repeat these exact examples' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop request' }));
    expect(c.cancel).toHaveBeenCalledOnce();
});

describe('sentence practice reading order and free actions', () => {
    it('places the checking notice after the answer and keeps cancellation available', () => {
        const c = controller({
            draft: 'Hola',
            busy: true,
            job: {
                id: '10000000-0000-4000-8000-000000000003',
                kind: 'sentence-check',
                state: 'running',
                cancellationRequested: false,
                attemptCount: 1,
                failureCode: null,
                result: null,
                createdAt: '2026-10-05T00:00:00.000Z',
                updatedAt: '2026-10-05T00:00:00.000Z',
            },
        });
        practice(c);
        const answer = screen.getByRole('textbox');
        const checking = screen.getByRole('status');
        expect(checking).toHaveTextContent('Checking your answer');
        expect(
            answer.compareDocumentPosition(checking) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(answer).toHaveValue('Hola');
        expect(answer).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Stop request' }));
        expect(c.cancel).toHaveBeenCalledOnce();
        expect(
            screen.getByRole('button', { name: 'Checking…' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', {
                name: 'Compare with reference — free',
            }),
        ).toBeDisabled();
    });

    it('places the generation notice after the sentence placeholder without exposing an old answer', () => {
        const c = controller({
            phase: 'loading',
            exercise: null,
            busy: true,
            job: {
                id: '10000000-0000-4000-8000-000000000003',
                kind: 'sentence-generation',
                state: 'queued',
                cancellationRequested: false,
                attemptCount: 0,
                failureCode: null,
                result: null,
                createdAt: '2026-10-05T00:00:00.000Z',
                updatedAt: '2026-10-05T00:00:00.000Z',
            },
        });
        practice(c);
        const generating = screen.getByRole('status');
        expect(generating).toHaveTextContent(
            'Preparing a sentence — waiting to start',
        );
        expect(generating.previousElementSibling).toHaveAttribute(
            'aria-hidden',
            'true',
        );
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Two ways to check' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Stop request' }));
        expect(c.cancel).toHaveBeenCalledOnce();
    });

    it('keeps the two-method explanation after AI feedback and before the footer actions', () => {
        const c = controller({ draft: 'Hola' });
        c.attempt = {
            id: '10000000-0000-4000-8000-000000000003',
            exercise: c.exercise!,
            contentState: 'current',
            sessionId: '10000000-0000-4000-8000-000000000004',
            answer: 'Hola',
            explanationLanguage: 'en',
            revealedHintIds: [],
            assisted: false,
            referenceRevealed: false,
            createdAt: '2026-10-05T00:00:00.000Z',
            feedback: {
                percentage: 100,
                rating: 'perfect',
                meaning: 'correct',
                grammar: 'correct',
                targets: [],
                issues: [],
                improvedTranslation: 'Hola',
                explanation: 'Correct',
            },
        };
        practice(c);
        const feedback = screen.getByRole('region', { name: 'AI feedback' });
        const explanation = screen.getByRole('heading', {
            name: 'Two ways to check',
        });
        const comparison = screen.getByRole('button', {
            name: 'Compare with reference — free',
        });
        expect(
            feedback.compareDocumentPosition(explanation) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            explanation.compareDocumentPosition(comparison) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(comparison).toHaveAccessibleDescription(
            /Comparison ignores case, spacing, punctuation and apostrophe style/,
        );
    });

    it('reveals the free reference for an empty answer and compares a nonempty answer through one footer action', () => {
        const c = controller({ recompare: vi.fn() });
        const view = render(
            <I18nProvider locale='en' messages={en}>
                <SentencePracticeSession
                    controller={c}
                    open
                    onClose={vi.fn()}
                />
            </I18nProvider>,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Show reference — free' }),
        );
        expect(c.revealReference).toHaveBeenCalledOnce();
        expect(c.recompare).not.toHaveBeenCalled();
        expect(c.check).not.toHaveBeenCalled();
        view.rerender(
            <I18nProvider locale='en' messages={en}>
                <SentencePracticeSession
                    controller={{ ...c, draft: 'Hola' }}
                    open
                    onClose={vi.fn()}
                />
            </I18nProvider>,
        );
        expect(
            screen.queryByRole('button', { name: 'Show reference — free' }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Compare with reference — free',
            }),
        );
        expect(c.recompare).toHaveBeenCalledOnce();
        expect(c.revealReference).toHaveBeenCalledOnce();
        expect(c.check).not.toHaveBeenCalled();
    });
});

it('offers saved-answer playback after a completed round even for a low AI score, and stops rendering controls when details are hidden', () => {
    const c = controller({
        phase: 'completed',
        sessionId: '10000000-0000-4000-8000-000000000004',
    });
    const exercise = c.exercise!;
    const attempt = {
        id: '10000000-0000-4000-8000-000000000003',
        exercise,
        contentState: 'current' as const,
        sessionId: c.sessionId!,
        answer: 'Incorrect answer',
        explanationLanguage: 'en' as const,
        revealedHintIds: [],
        assisted: false,
        referenceRevealed: false,
        createdAt: '2026-10-05T00:00:00.000Z',
        feedback: {
            percentage: 0,
            rating: 'practise-again-later' as const,
            meaning: 'incorrect' as const,
            grammar: 'substantive-errors' as const,
            targets: [],
            issues: [],
            improvedTranslation: 'Hola',
            explanation: 'Try again',
        },
    };
    c.roundItems = [
        {
            exercise,
            answer: attempt.answer,
            attempt,
            reference: null,
            comparison: null,
            revealedHintIds: [],
            skipped: false,
            outcome: 'ai-checked',
        },
    ];
    render(
        <I18nProvider locale='en' messages={en}>
            <SentencePracticeSession
                controller={c}
                open
                onClose={vi.fn()}
                renderAudio={(content) => (
                    <button>
                        {content.kind === 'checked-answer'
                            ? 'Play saved answer'
                            : 'Play prompt'}
                    </button>
                )}
            />
        </I18nProvider>,
    );
    expect(
        screen.getByRole('button', { name: 'Play saved answer', exact: true }),
    ).toBeVisible();
    expect(
        screen.getByRole('button', { name: 'Play prompt', exact: true }),
    ).toBeVisible();
    fireEvent.click(
        screen.getByRole('button', { name: 'Hide details', exact: true }),
    );
    expect(
        screen.queryByRole('button', {
            name: 'Play saved answer',
            exact: true,
        }),
    ).toBeNull();
});
