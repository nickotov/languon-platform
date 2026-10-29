import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import {
    KnowledgePrivateTranslation,
    type KnowledgePrivateTranslationProps,
} from '@/fsd/widgets/knowledge-private-translation';
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
it('switches an existing private bilingual view from French to German without retaining the previous target state', async () => {
    const props: KnowledgePrivateTranslationProps = {
        actorId: '11111111-1111-4111-8111-111111111111',
        noteId: '22222222-2222-4222-8222-222222222222',
        noteVersion: 1,
        block: {
            id: '33333333-3333-4333-8333-333333333333',
            type: 'bilingual-text',
            language: 'en',
            segments: [
                { id: '44444444-4444-4444-8444-444444444444', text: 'Hello.' },
            ],
            translations: [],
        },
        requestWithSession: (callback) => callback('synthetic-token'),
    };
    const base = {
        noteId: props.noteId,
        blockId: props.block.id,
        sourceFingerprint: 'a'.repeat(64),
        updatedAt: '2026-10-29T00:00:00Z',
    };
    transport.list.mockResolvedValue({
        translations: [
            {
                ...base,
                targetLanguage: 'fr',
                segments: [
                    {
                        sourceSegmentId: props.block.segments[0]!.id,
                        text: 'Bonjour.',
                    },
                ],
            },
            {
                ...base,
                targetLanguage: 'de',
                segments: [
                    {
                        sourceSegmentId: props.block.segments[0]!.id,
                        text: 'Guten Tag.',
                    },
                ],
            },
        ],
    });
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={client}>
            <KnowledgePrivateTranslation {...props} />
        </QueryClientProvider>,
    );
    fireEvent.click(
        screen.getByText('Private translation', { selector: 'summary' }),
    );
    const region = await screen.findByRole('region', {
        name: 'Your private bilingual view',
    });
    fireEvent.click(
        within(region).getByRole('button', { name: 'Bilingual', exact: true }),
    );
    expect(screen.getByText('Bonjour.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Target language'), {
        target: { value: 'de' },
    });
    await waitFor(() =>
        expect(
            within(region).getByRole('button', {
                name: 'Original',
                exact: true,
            }),
        ).toHaveAttribute('aria-pressed', 'true'),
    );
    fireEvent.click(
        within(region).getByRole('button', { name: 'Bilingual', exact: true }),
    );
    expect(screen.getByText('Guten Tag.')).toBeInTheDocument();
    expect(screen.queryByText('Bonjour.')).not.toBeInTheDocument();
    expect(transport.request).not.toHaveBeenCalled();
});
