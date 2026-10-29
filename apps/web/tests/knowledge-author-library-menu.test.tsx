import { createRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import {
    KnowledgeEditor,
    type KnowledgeEditorHandle,
} from '../src/fsd/features/knowledge-notes';
import { render } from './render';

const noteId = '11111111-1111-4111-8111-111111111111';
const entry = {
    id: '22222222-2222-4222-8222-222222222222',
    term: 'hello',
    translation: 'bonjour',
};
const block = {
    id: noteId,
    type: 'vocabulary',
    title: 'Words',
    language: 'en',
    translationLanguage: 'fr',
    entries: [entry],
};
const body = KnowledgeBodySchema.parse({
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: [{ type: 'learningBlock', attrs: { block } }],
    },
});
afterEach(() => vi.unstubAllGlobals());

it('opens library saving from the one block menu and previews the flushed private working source', async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
            requests.push(JSON.parse(String(init.body)));
            return Response.json({ entries: [entry], remainingRows: 100 });
        }),
    );
    const flush = vi
        .fn()
        .mockResolvedValue({ branchId: noteId, expectedVersion: 8 });
    const change = vi.fn();
    const menu = vi.fn().mockReturnValue(null);
    const ref = createRef<KnowledgeEditorHandle>();
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={client}>
            <KnowledgeEditor
                ref={ref}
                value={body}
                onChange={change}
                workspace={{
                    toolbarRootId: 'author-library-toolbar',
                    editorId: 'author-library-editor',
                    proposalRootId: 'author-library-proposals',
                    onAskTutor: vi.fn(),
                    onAskOutline: vi.fn(),
                    renderBlockMenu: menu,
                    library: {
                        requestWithSession: (operation) =>
                            operation('synthetic-token'),
                        noteId,
                        workingSource: { branchId: noteId, expectedVersion: 7 },
                        resolveWorkingSource: flush,
                    },
                }}
            />
        </QueryClientProvider>,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    expect(
        screen.getAllByRole('button', { name: 'Block settings: Words' }),
    ).toHaveLength(1);
    fireEvent.click(
        screen.getByRole('button', { name: 'Block settings: Words' }),
    );
    fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Save to dictionary' }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Preview', exact: true }),
    );
    await screen.findByRole('button', { name: 'Save independent copy' });
    expect(flush).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
        noteId,
        workingSource: { branchId: noteId, expectedVersion: 8 },
        blockId: block.id,
        entryIds: [entry.id],
    });
    expect(requests[0]).not.toHaveProperty('noteVersion');
    expect(change).not.toHaveBeenCalled();
    expect(menu).toHaveBeenCalledWith(
        expect.objectContaining({ id: block.id }),
        expect.arrayContaining([
            expect.objectContaining({ label: 'Edit' }),
            expect.objectContaining({ label: 'Save to dictionary' }),
        ]),
    );
});
