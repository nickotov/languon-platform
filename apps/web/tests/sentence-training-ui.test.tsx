import {
    act,
    fireEvent,
    render,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SentenceAttempt, SentenceManualReview } from '@languon/contracts';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import {
    ReferencePanel,
    segmentAnswer,
    SentenceWithHints,
} from '@/fsd/features/sentence-training/ui/sentence-content/sentence-content';
import { restoreSentenceTopLayer } from '@/fsd/features/sentence-training/ui/restore-sentence-top-layer';
import { useSentenceDisplay } from '@/fsd/features/sentence-training/ui/use-sentence-display';

afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document, 'exitFullscreen');
    vi.restoreAllMocks();
});
const exercise: SentenceManualReview['exercise'] = {
    id: '00000000-0000-4000-8000-000000000001',
    dictionaryId: '00000000-0000-4000-8000-000000000002',
    direction: 'source-to-target',
    sourceLanguage: 'en',
    targetLanguage: 'es',
    sourceText: 'A book, a book.',
    segments: [
        { id: 'segment-1', start: 0, end: 2, text: 'A ', target: null },
        {
            id: 'segment-2',
            start: 2,
            end: 6,
            text: 'book',
            target: {
                entryId: '00000000-0000-4000-8000-000000000003',
                hintId: 'hint-1',
                occurrenceId: 'occurrence-1',
            },
        },
        { id: 'segment-3', start: 6, end: 10, text: ', a ', target: null },
        {
            id: 'segment-4',
            start: 10,
            end: 14,
            text: 'book',
            target: {
                entryId: '00000000-0000-4000-8000-000000000003',
                hintId: 'hint-1',
                occurrenceId: 'occurrence-2',
            },
        },
        { id: 'segment-5', start: 14, end: 15, text: '.', target: null },
    ],
    hints: [{ id: 'hint-1', text: 'libro' }],
    generationPolicyVersion: 1,
    createdAt: '2026-10-04T00:00:00.000Z',
};
const review: SentenceManualReview = {
    id: '00000000-0000-4000-8000-000000000004',
    exercise,
    contentState: 'current',
    sessionId: '00000000-0000-4000-8000-000000000005',
    referenceTranslation: 'Un libro, un libro.',
    createdAt: '2026-10-04T00:00:00.000Z',
};
describe('sentence content', () => {
    it('preserves exact text and gives repeated admitted targets the same hint identity', async () => {
        const reveal = vi.fn();
        const { container } = render(
            <I18nProvider locale='en' messages={en}>
                <SentenceWithHints
                    exercise={exercise}
                    revealedHintIds={[]}
                    onReveal={reveal}
                />
            </I18nProvider>,
        );
        expect(container.querySelector('p')?.textContent).toBe(
            exercise.sourceText,
        );
        const targets = screen.getAllByRole('button', {
            name: 'book: show hint · Required word',
        });
        fireEvent.click(targets[0]!);
        expect(reveal).toHaveBeenLastCalledWith('hint-1');
        expect(
            await screen.findByRole('dialog', { name: 'Hint: book' }),
        ).toHaveTextContent('libro');
        expect(
            (await screen.findByRole('dialog', { name: 'Hint: book' }))
                .parentElement,
        ).toBe(document.body);
        fireEvent.keyDown(targets[0]!, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(targets[0]).toHaveFocus());
        fireEvent.click(targets[1]!);
        expect(reveal).toHaveBeenLastCalledWith('hint-1');
    });
    it('renders manual reference without a score or verdict and keeps the review on collapse', () => {
        render(
            <I18nProvider locale='en' messages={en}>
                <ReferencePanel review={review} />
            </I18nProvider>,
        );
        expect(
            screen.getByText(review.referenceTranslation),
        ).toBeInTheDocument();
        expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
        expect(
            screen.queryByText(review.referenceTranslation),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Manually reviewed')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show again' }));
        expect(
            screen.getByText(review.referenceTranslation),
        ).toBeInTheDocument();
    });
    it('uses backend UTF-16 spans without splitting an emoji and refuses mismatched quotes', () => {
        const issue: SentenceAttempt['feedback']['issues'][number] = {
            id: 'issue-1',
            kind: 'meaning',
            severity: 'minor',
            span: { start: 2, end: 5, quote: 'bad' },
            explanation: 'Check meaning',
            correction: 'good',
        };
        expect(segmentAnswer('😀bad!', [issue])).toEqual([
            { text: '😀', issue: null },
            { text: 'bad', issue: 0 },
            { text: '!', issue: null },
        ]);
        expect(
            segmentAnswer('😀bad!', [
                { ...issue, span: { start: 2, end: 5, quote: 'wrong' } },
            ]),
        ).toEqual([{ text: '😀bad!', issue: null }]);
    });
});
describe('sentence presentation cleanup', () => {
    it('keeps the same modal, draft and focused control when fullscreen reorders the top layer', async () => {
        const dialog = document.createElement('dialog');
        const draft = document.createElement('textarea');
        draft.value = 'Un libro';
        dialog.append(draft);
        document.body.append(dialog);
        dialog.open = true;
        draft.focus();
        const onClose = vi.fn();
        dialog.addEventListener('close', onClose);
        // jsdom lacks a native top layer. Preserve native close's asynchronous
        // event semantics: the old close arrives after the same modal reopened.
        Object.defineProperty(dialog, 'close', {
            value: () => {
                dialog.open = false;
                queueMicrotask(() => dialog.dispatchEvent(new Event('close')));
            },
        });
        Object.defineProperty(dialog, 'showModal', {
            value: () => {
                dialog.open = true;
            },
        });
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            value: document.documentElement,
        });
        restoreSentenceTopLayer(dialog);
        await Promise.resolve();
        expect(dialog.open).toBe(true);
        expect(dialog.querySelector('textarea')).toBe(draft);
        expect(draft.value).toBe('Un libro');
        expect(draft).toHaveFocus();
        expect(onClose).not.toHaveBeenCalled();
        // A subsequent user close remains observable; only the refresh close
        // is suppressed, not all future lifecycle or dismissal events.
        dialog.dispatchEvent(new Event('close'));
        expect(onClose).toHaveBeenCalledOnce();
        dialog.remove();
    });
    it('retains an already-open nested confirmation when the initial fullscreen grant is slow', async () => {
        const practice = document.createElement('dialog');
        const confirmation = document.createElement('dialog');
        const keep = document.createElement('button');
        keep.textContent = 'Keep practising';
        confirmation.append(keep);
        practice.append(confirmation);
        document.body.append(practice);
        const exited = vi.fn();
        for (const modal of [practice, confirmation]) {
            modal.open = true;
            modal.addEventListener('close', exited);
            Object.defineProperty(modal, 'close', {
                value: () => {
                    modal.open = false;
                    queueMicrotask(() =>
                        modal.dispatchEvent(new Event('close')),
                    );
                },
            });
            Object.defineProperty(modal, 'showModal', {
                value: () => {
                    modal.open = true;
                },
            });
        }
        keep.focus();
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            value: document.documentElement,
        });
        restoreSentenceTopLayer(practice);
        await Promise.resolve();
        expect(practice.open).toBe(true);
        expect(confirmation.open).toBe(true);
        expect(confirmation.parentElement).toBe(practice);
        expect(keep).toHaveFocus();
        expect(exited).not.toHaveBeenCalled();
        practice.remove();
    });
    it('releases native fullscreen when the grant arrives after practice closed', async () => {
        let resolve!: (entered: boolean) => void;
        const request = new Promise<boolean>((done) => {
            resolve = done;
        });
        const exit = vi.fn(async () => undefined);
        Object.defineProperty(document, 'exitFullscreen', {
            configurable: true,
            value: exit,
        });
        const { unmount } = renderHook(() => useSentenceDisplay(request));
        unmount();
        await act(async () => {
            await Promise.resolve();
        });
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            value: document.documentElement,
        });
        await act(async () => {
            resolve(true);
            await request;
        });
        expect(exit).toHaveBeenCalledOnce();
    });
});
