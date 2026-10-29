import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
    KnowledgeBilingualStudy,
    type KnowledgeBilingualStudyProps,
} from '@/fsd/widgets/knowledge-private-translation';
import type { KnowledgeReadingBlockOverrides } from '@/fsd/features/knowledge-notes';
const transport = vi.hoisted(() => ({
    list: vi.fn(),
    request: vi.fn(),
    job: vi.fn(),
    cancel: vi.fn(),
}));
vi.mock(
    '@/fsd/widgets/knowledge-private-translation/api/private-translation-api',
    () => ({
        privateTranslationApi: () => transport,
        PrivateTranslationApiError: class extends Error {
            constructor(readonly status: number) {
                super('Unavailable');
            }
        },
    }),
);
vi.mock('@/fsd/shared/i18n', () => ({
    useI18n: () => ({ locale: 'en', href: (path: string) => path }),
}));
const id = '11111111-1111-4111-8111-111111111111';
const blockId = '22222222-2222-4222-8222-222222222222';
const segmentId = '33333333-3333-4333-8333-333333333333';
const props: Omit<KnowledgeBilingualStudyProps, 'children'> = {
    actorId: id,
    noteId: id,
    noteVersion: 1,
    block: {
        id: blockId,
        type: 'bilingual-text',
        language: 'fr',
        segments: [{ id: segmentId, text: 'Bonjour tout le monde.' }],
        translations: [
            {
                language: 'ru',
                segments: [
                    { sourceSegmentId: segmentId, text: 'Всем привет.' },
                ],
            },
        ],
    },
    requestWithSession: (callback) => callback('synthetic-token'),
    library: {
        noteId: id,
        noteVersion: 1,
        requestWithSession: (callback) => callback('synthetic-token'),
    },
};
const german = {
    noteId: id,
    blockId,
    sourceFingerprint: 'a'.repeat(64),
    targetLanguage: 'de',
    updatedAt: '2026-10-29T00:00:00Z',
    segments: [{ sourceSegmentId: segmentId, text: 'Hallo zusammen.' }],
};
beforeEach(() => {
    vi.clearAllMocks();
    transport.list.mockResolvedValue({ translations: [german] });
});
function mount() {
    let latest: KnowledgeReadingBlockOverrides | undefined;
    function reading(value: KnowledgeReadingBlockOverrides) {
        latest = value;
        return <>{value.content}</>;
    }
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={client}>
            <KnowledgeBilingualStudy {...props}>
                {reading}
            </KnowledgeBilingualStudy>
        </QueryClientProvider>,
    );
    return () => latest;
}
it('switches a single inline view between prepared and personal languages and scopes library copying to the selected private overlay', async () => {
    const original = JSON.stringify(props.block);
    const latest = mount();
    await waitFor(() => expect(transport.list).toHaveBeenCalled());
    expect(screen.getAllByText('Bonjour tout le monde.')).toHaveLength(1);
    expect(screen.getByText('Всем привет.')).toBeVisible();
    expect(screen.queryByText('Hallo zusammen.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Translation language'), {
        target: { value: 'de' },
    });
    expect(await screen.findByText('Hallo zusammen.')).toBeVisible();
    expect(screen.queryByText('Всем привет.')).not.toBeInTheDocument();
    expect(latest()?.library).toMatchObject({
        translationLanguage: 'de',
        privateTranslation: {
            sourceFingerprint: german.sourceFingerprint,
            updatedAt: german.updatedAt,
        },
    });
    fireEvent.click(
        screen.getByRole('button', { name: 'Original', exact: true }),
    );
    expect(screen.queryByText('Hallo zusammen.')).not.toBeInTheDocument();
    expect(latest()?.library?.privateTranslation).toBeUndefined();
    expect(transport.request).not.toHaveBeenCalled();
    expect(JSON.stringify(props.block)).toBe(original);
});
it('keeps a pending private target bound to its request when the learner selects another language', async () => {
    transport.list.mockResolvedValue({ translations: [] });
    let finish: ((value: unknown) => void) | undefined;
    transport.request.mockImplementation(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const latest = mount();
    await waitFor(() => expect(transport.list).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Translation language'), {
        target: { value: 'de' },
    });
    fireEvent.click(
        await screen.findByRole('button', { name: 'Translate privately' }),
    );
    await waitFor(() => expect(transport.request).toHaveBeenCalled());
    expect(transport.request.mock.calls[0]?.[0]).toMatchObject({
        targetLanguage: 'de',
    });
    fireEvent.change(screen.getByLabelText('Translation language'), {
        target: { value: 'es' },
    });
    transport.list.mockResolvedValue({ translations: [german] });
    await act(async () => {
        finish?.({ job: { id, state: 'completed' } });
    });
    await waitFor(() =>
        expect(
            screen.getByRole('button', { name: 'Translate privately' }),
        ).toBeEnabled(),
    );
    expect(screen.getByLabelText('Translation language')).toHaveValue('es');
    expect(screen.queryByText('Hallo zusammen.')).not.toBeInTheDocument();
    expect(latest()?.library?.privateTranslation).toBeUndefined();
    expect(transport.request).toHaveBeenCalledTimes(1);
});

it('reaches inline private translation through the real document renderer and whole-block wrapper', async () => {
    const { KnowledgeDocumentView } =
        await import('@/fsd/features/knowledge-notes');
    const { KnowledgeBodySchema } = await import('@languon/contracts');
    const sharedBlock = {
        ...props.block,
        title: 'Shared greeting',
        language: 'en',
        segments: [{ id: segmentId, text: 'Hello world.' }],
        translations: [
            {
                language: 'es',
                segments: [{ sourceSegmentId: segmentId, text: 'Hola mundo.' }],
            },
        ],
    };
    const french = {
        ...german,
        targetLanguage: 'fr',
        segments: [{ sourceSegmentId: segmentId, text: 'Bonjour le monde.' }],
    };
    transport.list.mockResolvedValue({ translations: [] });
    transport.request.mockImplementation(async () => {
        transport.list.mockResolvedValue({ translations: [french] });
        return { job: { id, state: 'completed' } };
    });
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [{ type: 'learningBlock', attrs: { block: sharedBlock } }],
        },
    });
    const wrap: NonNullable<
        React.ComponentProps<typeof KnowledgeDocumentView>['wrapBlock']
    > = (block, reading) => {
        if (block.type !== 'bilingual-text') return reading();
        return (
            <KnowledgeBilingualStudy {...props} block={block}>
                {reading}
            </KnowledgeBilingualStudy>
        );
    };
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={client}>
            <KnowledgeDocumentView
                body={body}
                wrapBlock={wrap}
                library={props.library}
            />
        </QueryClientProvider>,
    );
    const greeting = screen.getByRole('region', {
        name: 'Shared greeting',
        exact: true,
    });
    const { within } = await import('@testing-library/react');
    const view = within(greeting);
    expect(
        view.getByRole('combobox', {
            name: 'Translation language',
            exact: true,
        }),
    ).toHaveAttribute('aria-label', 'Translation language');
    fireEvent.change(view.getByLabelText('Translation language'), {
        target: { value: 'fr' },
    });
    fireEvent.click(
        await view.findByRole('button', {
            name: 'Translate privately',
            exact: true,
        }),
    );
    expect(await view.findByText('Bonjour le monde.')).toBeVisible();
    expect(view.getAllByText('Hello world.')).toHaveLength(1);
    expect(view.queryByText('Hola mundo.')).not.toBeInTheDocument();
    expect(greeting.querySelector('details')).toBeNull();
    expect(transport.request.mock.calls[0]?.[0]).toMatchObject({
        targetLanguage: 'fr',
    });
});
