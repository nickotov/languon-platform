import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LearningBlockSchema, TextSchema } from '@languon/contracts';
import { BlockLibrarySave } from '../src/fsd/features/knowledge-notes/ui/library-copy/block-library-save';
import {
    textLibraryBlock,
    vocabularyLibraryBlock,
} from '../src/fsd/features/knowledge-notes/lib/library-block-content';
import type { KnowledgeLibraryContext } from '../src/fsd/features/knowledge-notes/api/library-copy-api';
import { render } from './render';
const id = '11111111-1111-4111-8111-111111111111';
const pair = '22222222-2222-4222-8222-222222222222';
const context: KnowledgeLibraryContext = {
    requestWithSession: (operation) => operation('synthetic-token'),
    noteId: id,
    noteVersion: 7,
    access: { kind: 'note', locator: 'a'.repeat(32), key: 'b'.repeat(43) },
};
const text = TextSchema.parse({
    id,
    folderId: null,
    title: 'Reading',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    sourceText: '  Hello.\n',
    alignment: {
        source: [
            {
                pairId: pair,
                text: '  Hello.\n',
                startOffset: 0,
                endOffset: 9,
                paragraphIndex: 0,
            },
        ],
        translation: [{ pairId: pair, text: ' Bonjour. ' }],
        editedPairIds: [],
    },
    status: 'translated',
    lifecycle: 'active',
    version: 1,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
});
afterEach(() => vi.unstubAllGlobals());
function renderLibrary(
    element: ReactElement,
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
    return render(
        <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    );
}

it('copies owned library content with fresh identities and exact source/translation alignment', () => {
    const block = textLibraryBlock(text);
    expect(block).toMatchObject({
        type: 'bilingual-text',
        segments: [{ text: '  Hello.\n' }],
        translations: [{ segments: [{ text: ' Bonjour. ' }] }],
    });
    if (block.type !== 'bilingual-text') throw new Error('Expected text');
    expect(block.id).not.toBe(id);
    expect(block.segments[0]?.id).not.toBe(pair);
    expect(block.translations[0]?.segments[0]?.sourceSegmentId).toBe(
        block.segments[0]?.id,
    );
    const vocabulary = vocabularyLibraryBlock(
        { name: 'Words', sourceLanguage: 'en', targetLanguage: 'fr' },
        [
            {
                values: {
                    source: '<script>literal</script>',
                    translation: 'texte',
                    transcription: null,
                    definition: 'An explicit definition.',
                    example: null,
                    exampleTranslation: null,
                },
            },
        ],
    );
    const original = textLibraryBlock({
        ...text,
        alignment: null,
        sourceText: '😀'.repeat(5_000),
    });
    if (original.type !== 'bilingual-text') throw new Error('Expected text');
    expect(original.segments.map((segment) => segment.text).join('')).toBe(
        '😀'.repeat(5_000),
    );
    expect(original.segments.length).toBeGreaterThan(1);
    expect(vocabulary).toMatchObject({
        entries: [
            {
                term: '<script>literal</script>',
                definition: 'An explicit definition.',
            },
        ],
    });
});
it('previews authoritative saved text before an explicit library commit with source access headers', async () => {
    const calls: {
        url: string;
        body: Record<string, unknown>;
        headers: Headers;
    }[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({
                url,
                body: JSON.parse(String(init.body)),
                headers: new Headers(init.headers),
            });
            if (url.endsWith('/preview'))
                return Response.json({
                    text: {
                        title: 'Reading',
                        sourceLanguage: 'en',
                        targetLanguage: 'fr',
                        sourceText: text.sourceText,
                        alignment: text.alignment,
                    },
                    isNew: true,
                });
            return Response.json({ text });
        }),
    );
    const block = textLibraryBlock(text);
    if (block.type !== 'bilingual-text') throw new Error('Expected text');
    const client = new QueryClient();
    client.setQueryData(['texts', 'actor', 'folders'], []);
    client.setQueryData(['text', 'actor', id], text);
    client.setQueryData(['text', 'actor', pair], text);
    client.setQueryData(['library-navigation', 'actor'], []);
    renderLibrary(<BlockLibrarySave block={block} context={context} />, client);
    fireEvent.click(screen.getByRole('button', { name: 'Save to Texts' }));
    fireEvent.click(
        screen.getByRole('button', { name: 'Preview', exact: true }),
    );
    await screen.findByRole('button', { name: 'Save independent copy' });
    expect(
        client.getQueryState(['texts', 'actor', 'folders'])?.isInvalidated,
    ).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/knowledge/library/text/preview');
    expect(calls[0]?.body).toMatchObject({
        noteId: id,
        noteVersion: 7,
        blockId: block.id,
        destination: { kind: 'new', title: 'Reading' },
    });
    expect(calls[0]?.headers.get('X-Languon-Share-Key')).toBe(
        context.access?.key,
    );
    expect(calls[0]?.headers.get('Authorization')).toBe(
        'Bearer synthetic-token',
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Save independent copy' }),
    );
    await screen.findByRole('status');
    expect(
        client.getQueryState(['texts', 'actor', 'folders'])?.isInvalidated,
    ).toBe(true);
    expect(client.getQueryState(['text', 'actor', id])?.isInvalidated).toBe(
        true,
    );
    expect(client.getQueryState(['text', 'actor', pair])?.isInvalidated).toBe(
        false,
    );
    expect(
        client.getQueryState(['library-navigation', 'actor'])?.isInvalidated,
    ).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toEqual(calls[0]?.body);
});
it('retains one operation identity for failed vocabulary commit retries and never shows false success', async () => {
    const entry = { id: pair, term: 'hello', translation: 'bonjour' };
    const block = LearningBlockSchema.parse({
        id,
        type: 'vocabulary',
        title: 'Words',
        language: 'en',
        translationLanguage: 'fr',
        entries: [entry],
    });
    if (block.type !== 'vocabulary') throw new Error('Expected vocabulary');
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            requests.push(JSON.parse(String(init.body)));
            return url.endsWith('/preview')
                ? Response.json({ entries: [entry], remainingRows: 100 })
                : Response.json(
                      {
                          error: {
                              code: 'service_unavailable',
                              message: 'Temporary failure',
                              correlationId: 'synthetic',
                          },
                      },
                      { status: 503 },
                  );
        }),
    );
    const client = new QueryClient();
    client.setQueryData(['dictionaries', 'actor'], []);
    renderLibrary(<BlockLibrarySave block={block} context={context} />, client);
    fireEvent.click(screen.getByRole('button', { name: 'Save to dictionary' }));
    fireEvent.click(
        screen.getByRole('button', { name: 'Preview', exact: true }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Save independent copy' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByRole('status')).toBeNull();
    await waitFor(() =>
        expect(
            screen.getByRole('button', { name: 'Save independent copy' }),
        ).toBeEnabled(),
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Save independent copy' }),
    );
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(client.getQueryState(['dictionaries', 'actor'])?.isInvalidated).toBe(
        false,
    );
    expect(requests[2]?.operationId).toBe(requests[1]?.operationId);
    expect(requests[1]).toEqual(requests[0]);
});

it('saves original-only blocks as drafts for an explicitly selected target language', async () => {
    const original = LearningBlockSchema.parse({
        id,
        type: 'bilingual-text',
        title: 'Original only',
        language: 'en',
        segments: [{ id: pair, text: text.sourceText }],
        translations: [],
    });
    if (original.type !== 'bilingual-text') throw new Error('Expected text');
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            bodies.push(JSON.parse(String(init.body)));
            return url.endsWith('/preview')
                ? Response.json({
                      text: {
                          title: original.title,
                          sourceLanguage: 'en',
                          targetLanguage: 'fr',
                          sourceText: text.sourceText,
                          alignment: null,
                      },
                      isNew: true,
                  })
                : Response.json({
                      text: {
                          ...text,
                          title: original.title,
                          alignment: null,
                          status: 'draft',
                      },
                  });
        }),
    );
    renderLibrary(<BlockLibrarySave block={original} context={context} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to Texts' }));
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Translation language' }),
        { target: { value: 'fr' } },
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Preview', exact: true }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Save independent copy' }),
    );
    await screen.findByRole('status');
    expect(bodies[0]).toMatchObject({ translationLanguage: 'fr' });
    expect(bodies[1]).toEqual(bodies[0]);
});

it('flushes a private working source once for preview and keeps its exact request on technical copy retries', async () => {
    const resolveWorkingSource = vi.fn(async () => ({
        branchId: pair,
        expectedVersion: 9,
    }));
    const working: KnowledgeLibraryContext = {
        requestWithSession: context.requestWithSession,
        noteId: id,
        workingSource: { branchId: pair, expectedVersion: 7 },
        resolveWorkingSource,
    };
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            bodies.push(JSON.parse(String(init.body)));
            if (url.endsWith('/preview'))
                return Response.json({
                    text: {
                        title: 'Reading',
                        sourceLanguage: 'en',
                        targetLanguage: 'fr',
                        sourceText: text.sourceText,
                        alignment: text.alignment,
                    },
                    isNew: true,
                });
            return Response.json(
                {
                    error: {
                        code: 'service_unavailable',
                        message: 'Try again.',
                        correlationId: 'synthetic',
                    },
                },
                { status: 503 },
            );
        }),
    );
    const block = textLibraryBlock(text);
    renderLibrary(<BlockLibrarySave block={block} context={working} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to Texts' }));
    fireEvent.click(
        screen.getByRole('button', { name: 'Preview', exact: true }),
    );
    const commit = await screen.findByRole('button', {
        name: 'Save independent copy',
    });
    expect(resolveWorkingSource).toHaveBeenCalledTimes(1);
    expect(bodies[0]).toMatchObject({
        workingSource: { branchId: pair, expectedVersion: 9 },
    });
    expect(bodies[0]).not.toHaveProperty('noteVersion');
    resolveWorkingSource.mockResolvedValue({
        branchId: pair,
        expectedVersion: 10,
    });
    fireEvent.click(commit);
    await screen.findByRole('alert');
    await waitFor(() => expect(commit).toBeEnabled());
    fireEvent.click(commit);
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(resolveWorkingSource).toHaveBeenCalledTimes(1);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
});

it('requires explicit fresh preview after a working source version conflict instead of copying changed material', async () => {
    const resolveWorkingSource = vi.fn(async () => ({
        branchId: pair,
        expectedVersion: 9,
    }));
    const working: KnowledgeLibraryContext = {
        requestWithSession: context.requestWithSession,
        noteId: id,
        workingSource: { branchId: pair, expectedVersion: 7 },
        resolveWorkingSource,
    };
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            bodies.push(JSON.parse(String(init.body)));
            if (url.endsWith('/preview'))
                return Response.json({
                    text: {
                        title: 'Reading',
                        sourceLanguage: 'en',
                        targetLanguage: 'fr',
                        sourceText: text.sourceText,
                        alignment: text.alignment,
                    },
                    isNew: true,
                });
            return Response.json(
                {
                    error: {
                        code: 'version_conflict',
                        message: 'Preview changed material.',
                        correlationId: 'synthetic',
                    },
                },
                { status: 409 },
            );
        }),
    );
    renderLibrary(
        <BlockLibrarySave block={textLibraryBlock(text)} context={working} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save to Texts' }));
    fireEvent.click(
        screen.getByRole('button', { name: 'Preview', exact: true }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Save independent copy' }),
    );
    await screen.findByRole('alert');
    expect(resolveWorkingSource).toHaveBeenCalledTimes(1);
    expect(bodies).toHaveLength(2);
    resolveWorkingSource.mockResolvedValue({
        branchId: pair,
        expectedVersion: 10,
    });
    fireEvent.click(
        await screen.findByRole('button', { name: 'Preview', exact: true }),
    );
    await screen.findByRole('button', { name: 'Save independent copy' });
    expect(resolveWorkingSource).toHaveBeenCalledTimes(2);
    expect(bodies[2]).toMatchObject({
        workingSource: { branchId: pair, expectedVersion: 10 },
    });
    expect(bodies[2]?.operationId).not.toBe(bodies[0]?.operationId);
});
