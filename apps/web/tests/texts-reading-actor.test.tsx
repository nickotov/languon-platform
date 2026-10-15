import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from './render';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { TextReading } from '@/fsd/features/text-reading';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import type { ReadingDocument } from '@/fsd/features/text-reading';
vi.mock('@/fsd/entities/dictionary', () => ({
    dictionaryApi: { listDictionaries: vi.fn() },
}));
vi.mock('@/fsd/entities/texts', () => ({
    textsApi: {
        enqueueSelection: vi.fn(),
        getSelectionJob: vi.fn(),
        cancelSelectionJob: vi.fn(),
    },
    TextsApiError: class extends Error {},
}));
const id = '54b51acb-320e-4ea9-86f3-0d4502349b89';
const doc: ReadingDocument = {
    id,
    version: 1,
    status: 'translated',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    sourceText: 'Word is here.',
    alignment: {
        source: [
            {
                pairId: id,
                text: 'Word is here.',
                startOffset: 0,
                endOffset: 13,
                paragraphIndex: 0,
            },
        ],
        translation: [{ pairId: id, text: 'Слово здесь.' }],
        editedPairIds: [],
    },
};
const source = {
    kind: 'shared-text' as const,
    textId: id,
    shareId: id,
    expectedTextVersion: 1,
};
let actor = 'user-a';
// Intentionally stable across account changes, as in the production session wrapper.
const request: RequestWithTextSession = async (callback) => callback(actor);
function fixture() {
    const client = new QueryClient();
    const tree = () => (
        <I18nProvider locale='en' messages={en}>
            <QueryClientProvider client={client}>
                <TextReading
                    document={doc}
                    source={source}
                    matchMode={false}
                    requestWithSession={request}
                    collectionActorKey={actor}
                />
            </QueryClientProvider>
        </I18nProvider>
    );
    const result = render(tree());
    return {
        ...result,
        switchActor: () => {
            actor = 'user-b';
            result.rerender(tree());
        },
    };
}
async function openCollection(container: HTMLElement) {
    const span = container.querySelector('[data-side="source"]')!;
    const range = document.createRange();
    range.setStart(span.firstChild!, 0);
    range.setEnd(span.firstChild!, 4);
    range.getBoundingClientRect = () =>
        ({ top: 80, left: 40, width: 30, height: 20 }) as DOMRect;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event('selectionchange'));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Add to dictionary' }),
    );
}
function dictionaries(name: string) {
    return {
        data: [
            {
                id,
                name,
                sourceLanguage: 'en',
                targetLanguage: 'ru',
                version: 1,
                settingsVersion: 1,
                activeCardCount: 0,
            },
        ],
        nextCursor: null,
    };
}
beforeEach(() => {
    vi.clearAllMocks();
    actor = 'user-a';
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: () => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    });
});
describe('reader actor isolation under the same QueryClient', () => {
    it('aborts a deferred owner dictionary list and ignores its late result after switching actors', async () => {
        let finish!: (value: never) => void;
        vi.mocked(dictionaryApi.listDictionaries)
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    }),
            )
            .mockResolvedValueOnce(dictionaries('B dictionary') as never);
        const view = fixture();
        await openCollection(view.container);
        await waitFor(() =>
            expect(dictionaryApi.listDictionaries).toHaveBeenCalledTimes(1),
        );
        const signal = vi.mocked(dictionaryApi.listDictionaries).mock
            .calls[0]![2];
        view.switchActor();
        expect(signal?.aborted).toBe(true);
        await act(async () =>
            finish(dictionaries('A private dictionary') as never),
        );
        expect(
            screen.queryByText('A private dictionary'),
        ).not.toBeInTheDocument();
        await openCollection(view.container);
        expect(await screen.findByText('B dictionary')).toBeInTheDocument();
        expect(
            screen.queryByText('A private dictionary'),
        ).not.toBeInTheDocument();
    });
    it('clears an already loaded dictionary picker synchronously on actor change', async () => {
        vi.mocked(dictionaryApi.listDictionaries).mockResolvedValueOnce(
            dictionaries('A private dictionary') as never,
        );
        const view = fixture();
        await openCollection(view.container);
        expect(
            await screen.findByText('A private dictionary'),
        ).toBeInTheDocument();
        view.switchActor();
        expect(
            screen.queryByText('A private dictionary'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add card' }),
        ).not.toBeInTheDocument();
    });
    it('aborts pending collection and prevents old completion, toast, and marks from appearing for the next actor', async () => {
        vi.mocked(dictionaryApi.listDictionaries).mockResolvedValueOnce({
            data: [],
            nextCursor: null,
        } as never);
        let finish!: (value: never) => void;
        vi.mocked(textsApi.enqueueSelection).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const view = fixture();
        await openCollection(view.container);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Create new dictionary',
            }),
        );
        fireEvent.change(screen.getByLabelText(/Dictionary name/), {
            target: { value: 'A private dictionary' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create and add' }));
        await waitFor(() =>
            expect(textsApi.enqueueSelection).toHaveBeenCalledTimes(1),
        );
        const signal = vi.mocked(textsApi.enqueueSelection).mock.calls[0]![3];
        view.switchActor();
        expect(signal?.aborted).toBe(true);
        await act(async () =>
            finish({
                job: {
                    id,
                    state: 'completed',
                    dictionaryId: id,
                    cardId: id,
                    failureCode: null,
                },
            } as never),
        );
        expect(
            screen.queryByRole('link', { name: 'Open dictionary' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Added “Word”/)).not.toBeInTheDocument();
        expect(view.container.querySelector('mark')).toBeNull();
        expect(textsApi.getSelectionJob).not.toHaveBeenCalled();
    });
});
