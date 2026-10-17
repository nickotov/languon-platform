import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearningApi } from '@/fsd/features/flashcard-training';
import { ApiError } from '@/fsd/features/sentence-training/lib/api-error';
import type { SentenceApi } from '@/fsd/features/sentence-training';
import { SharedPracticeActions } from '@/fsd/widgets/dictionary-training/ui/shared-practice-actions/shared-practice-actions';
import { PracticeHistory } from '@/fsd/widgets/dictionary-training/ui/practice-history/practice-history';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
);
const originalClose = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'close',
);
beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
        configurable: true,
        value() {
            this.open = true;
        },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true,
        value() {
            this.open = false;
        },
    });
});
afterEach(() => {
    if (originalShowModal)
        Object.defineProperty(
            HTMLDialogElement.prototype,
            'showModal',
            originalShowModal,
        );
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (originalClose)
        Object.defineProperty(
            HTMLDialogElement.prototype,
            'close',
            originalClose,
        );
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    vi.restoreAllMocks();
});

function fixture() {
    const getProgress = vi
        .fn()
        .mockResolvedValue({ total: 7, known: 3, again: 2, unstudied: 2 });
    const progress = vi.fn().mockImplementation(async (direction) => ({
        direction,
        eligibleCount: 7,
        usedCount: direction === 'source-to-target' ? 4 : 1,
        remainingCount: direction === 'source-to-target' ? 3 : 6,
        completedCheckCount: 25,
        manualReviewCount: 12,
        assistedCheckCount: 8,
        ratings: { perfect: 10, good: 8, notBad: 5, practiseAgainLater: 2 },
    }));
    const attempts = vi
        .fn()
        .mockResolvedValue({ attempts: [], nextCursor: null });
    const manualReviews = vi
        .fn()
        .mockResolvedValue({ reviews: [], nextCursor: null });
    const learningApi = { getProgress } as unknown as LearningApi;
    const sentenceApi = {
        progress,
        attempts,
        manualReviews,
    } as unknown as SentenceApi;
    const props = {
        open: true,
        onClose: vi.fn(),
        learningApi,
        sentenceApi,
        identity: 'learner-1',
        dictionaryTitle: 'My words',
        sourceLanguage: 'French',
        targetLanguage: 'Russian',
        sentencesEnabled: true,
    };
    function draw() {
        return render(
            <I18nProvider locale='en' messages={en}>
                <PracticeHistory {...props} />
            </I18nProvider>,
        );
    }
    return { ...props, getProgress, progress, attempts, draw };
}

describe('dictionary practice history', () => {
    it('opens saved flashcard progress first without reading sentence history', async () => {
        const f = fixture();
        f.draw();
        expect(screen.getByRole('tab', { name: 'Flashcards' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await screen.findByText('7 active entries');
        expect(screen.getByText('Known')).toBeInTheDocument();
        expect(screen.getByText('Practise again')).toBeInTheDocument();
        expect(screen.getByText('Unstudied')).toBeInTheDocument();
        expect(f.progress).not.toHaveBeenCalled();
        expect(f.attempts).not.toHaveBeenCalled();
    });
    it('loads both labelled sentence directions and authoritative totals separately from history pages', async () => {
        const f = fixture();
        f.draw();
        fireEvent.click(screen.getByRole('tab', { name: 'Sentences' }));
        const source = screen.getByRole('region', { name: 'French → Russian' });
        const target = screen.getByRole('region', { name: 'Russian → French' });
        await waitFor(() =>
            expect(within(source).getByText('25')).toBeInTheDocument(),
        );
        expect(within(target).getByText('25')).toBeInTheDocument();
        expect(within(source).getByText('4')).toBeInTheDocument();
        expect(within(target).getByText('1')).toBeInTheDocument();
        expect(f.progress).toHaveBeenCalledWith('source-to-target');
        expect(f.progress).toHaveBeenCalledWith('target-to-source');
        await screen.findByText('No AI checks yet');
        fireEvent.click(screen.getByRole('button', { name: 'Manual reviews' }));
        expect(screen.getByText('No manual reviews yet')).toBeInTheDocument();
        expect(screen.getAllByText('12')).toHaveLength(2);
    });
    it('offers a retry for failed flashcard statistics without conflating failure with zero progress', async () => {
        const f = fixture();
        f.getProgress.mockRejectedValueOnce(new Error('Unavailable'));
        f.draw();
        await screen.findByText('Could not load saved progress');
        expect(screen.queryByText('7 active entries')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await screen.findByText('7 active entries');
        expect(f.getProgress).toHaveBeenCalledTimes(2);
    });
    it('keeps successful direction statistics visible when the other fails and retries only that direction', async () => {
        const f = fixture();
        f.progress.mockRejectedValueOnce(new Error('Unavailable'));
        f.draw();
        fireEvent.click(screen.getByRole('tab', { name: 'Sentences' }));
        const source = screen.getByRole('region', { name: 'French → Russian' });
        const target = screen.getByRole('region', { name: 'Russian → French' });
        await within(source).findByText('Could not load saved statistics');
        await within(target).findByText('25');
        fireEvent.click(within(source).getByRole('button', { name: 'Retry' }));
        await within(source).findByText('25');
        expect(f.progress.mock.calls.map(([direction]) => direction)).toEqual([
            'source-to-target',
            'target-to-source',
            'source-to-target',
        ]);
    });
    it('uses the same statistics and tabs inside active practice without nesting a dialog', async () => {
        const f = fixture();
        render(
            <I18nProvider locale='en' messages={en}>
                <PracticeHistory {...f} inline initialTab='sentences' />
            </I18nProvider>,
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Sentences' })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await screen.findByText('No AI checks yet');
        expect(f.progress).toHaveBeenCalledTimes(2);
        expect(f.getProgress).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('tab', { name: 'Flashcards' }));
        await screen.findByText('7 active entries');
    });
    it('unmounts statistics on close and ignores a pending response before a fresh reopen', async () => {
        const f = fixture();
        let finish!: (value: unknown) => void;
        f.getProgress.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        function contents(open: boolean) {
            return (
                <I18nProvider locale='en' messages={en}>
                    <PracticeHistory {...f} open={open} />
                </I18nProvider>
            );
        }
        const view = render(contents(true));
        expect(f.getProgress).toHaveBeenCalledOnce();
        view.rerender(contents(false));
        expect(
            screen.queryByRole('tab', { name: 'Flashcards' }),
        ).not.toBeInTheDocument();
        finish({ total: 999, known: 999, again: 0, unstudied: 0 });
        view.rerender(contents(true));
        await screen.findByText('7 active entries');
        expect(
            screen.queryByText('999 active entries'),
        ).not.toBeInTheDocument();
        expect(f.getProgress).toHaveBeenCalledTimes(2);
    });

    it('notifies the practice owner when sentence history reports lost dictionary access', async () => {
        const f = fixture();
        const onAccessLoss = vi.fn();
        f.attempts.mockRejectedValue(
            new ApiError(404, {
                code: 'dictionary_not_found',
                correlationId: 'history-test',
                message: 'Unavailable',
            }),
        );
        render(
            <I18nProvider locale='en' messages={en}>
                <PracticeHistory
                    {...f}
                    inline
                    initialTab='sentences'
                    onAccessLoss={onAccessLoss}
                />
            </I18nProvider>,
        );
        await waitFor(() => expect(onAccessLoss).toHaveBeenCalledOnce());
    });
});

describe('shared dictionary personal secondary actions', () => {
    it('keeps saved sentences and history separate from training and invokes their actions', async () => {
        const onOpenLibrary = vi.fn();
        const onOpenHistory = vi.fn();
        render(
            <I18nProvider locale='en' messages={en}>
                <SharedPracticeActions
                    signedIn
                    sentencesEnabled
                    onOpenLibrary={onOpenLibrary}
                    onOpenHistory={onOpenHistory}
                />
            </I18nProvider>,
        );
        const trigger = screen.getByRole('button', {
            name: 'More dictionary actions',
        });
        fireEvent.click(trigger);
        expect(await screen.findAllByRole('menuitem')).toHaveLength(2);
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Sentences' }),
        );
        expect(onOpenLibrary).toHaveBeenCalledOnce();
        fireEvent.click(trigger);
        fireEvent.click(
            await screen.findByRole('menuitem', {
                name: 'My practice history',
            }),
        );
        expect(onOpenHistory).toHaveBeenCalledOnce();
    });
    it('does not expose personal actions to an anonymous shared viewer', () => {
        render(
            <I18nProvider locale='en' messages={en}>
                <SharedPracticeActions
                    signedIn={false}
                    sentencesEnabled
                    onOpenLibrary={vi.fn()}
                    onOpenHistory={vi.fn()}
                />
            </I18nProvider>,
        );
        expect(
            screen.queryByRole('button', { name: 'More dictionary actions' }),
        ).not.toBeInTheDocument();
    });
});
