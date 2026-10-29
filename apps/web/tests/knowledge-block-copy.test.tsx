import {
    act,
    fireEvent,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
    KnowledgeWorkingBranchSchema,
    LearningBlockSchema,
} from '@languon/contracts';
import { CopyBlocksToNote } from '../src/fsd/features/knowledge-notes/ui/block-copy/copy-blocks-to-note';
import { useBlockCopy } from '../src/fsd/features/knowledge-notes/hooks/use-block-copy';
import type { KnowledgeBlockCopyContext } from '../src/fsd/features/knowledge-notes/api/block-copy-api';
import { render } from './render';
const id = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const destinationId = '33333333-3333-4333-8333-333333333333';
const branch = KnowledgeWorkingBranchSchema.parse({
    id: branchId,
    noteId: destinationId,
    version: 4,
    basePublishedVersion: 1,
    content: {
        title: 'Destination',
        summary: '',
        categories: [],
        studiedLanguage: 'en',
        explanationLanguage: 'en',
        body: {
            schemaVersion: 1,
            document: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
    },
    updatedAt: '2026-10-28T00:00:00.000Z',
});
const workspace = {
    noteId: destinationId,
    status: 'draft',
    published: null,
    preferredBranchId: branchId,
    branches: [branch],
    shareEnabled: false,
    limits: { referenceChars: 40000, editorChars: 40000 },
};
const context: KnowledgeBlockCopyContext = {
    requestWithSession: (operation) => operation('synthetic-token'),
    source: {
        kind: 'saved',
        noteId: id,
        expectedVersion: 7,
        access: { kind: 'note', locator: 'a'.repeat(32), key: 'b'.repeat(43) },
    },
    beforeApply: vi.fn().mockResolvedValue(undefined),
    onApplied: vi.fn(),
    onApplyingChange: vi.fn(),
};
afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});
it('shows dependency and media counts before explicit independent-copy application', async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            if (url.includes('/workspaces?'))
                return Response.json({
                    workspaces: [
                        {
                            id: destinationId,
                            title: 'Destination',
                            status: 'draft',
                            hasUnsavedChanges: false,
                            updatedAt: branch.updatedAt,
                        },
                    ],
                    total: 1,
                    offset: 0,
                    limit: 50,
                });
            if (url.endsWith('/workspace')) return Response.json({ workspace });
            const request = JSON.parse(String(init.body));
            calls.push(request);
            return Response.json({
                branch: request.preview ? null : { ...branch, version: 5 },
                selectedCount: 1,
                blockCount: 2,
                dependencyCount: 1,
                mediaCount: 1,
                replayed: false,
            });
        }),
    );
    const audioId = '44444444-4444-4444-8444-444444444444';
    const segmentId = '55555555-5555-4555-8555-555555555555';
    const audio = LearningBlockSchema.parse({
        id: audioId,
        type: 'audio',
        title: 'Audio source',
        assetId: audioId,
        transcript: {
            language: 'en',
            segments: [{ id: segmentId, text: 'The train leaves at noon.' }],
        },
    });
    const block = LearningBlockSchema.parse({
        id,
        type: 'exercise',
        format: 'free-text',
        title: 'Selected exercise',
        question: 'When?',
        referenceAnswer: 'Noon',
        explanation: 'It says noon.',
        source: { blockId: audioId, segmentIds: [segmentId] },
    });
    render(<CopyBlocksToNote context={context} blocks={[audio, block]} />);
    fireEvent.click(
        screen.getByRole('button', { name: 'Copy blocks to a note' }),
    );
    fireEvent.click(
        screen.getByRole('checkbox', { name: 'Selected exercise' }),
    );
    await screen.findByRole('option', { name: 'Destination' });
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Destination note' }),
        { target: { value: destinationId } },
    );
    await screen.findByRole('combobox', { name: 'Destination working draft' });
    await waitFor(() =>
        expect(
            screen.getByRole('button', { name: 'Preview copy' }),
        ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview copy' }));
    await screen.findByText('Linked source blocks included: 1');
    expect(
        screen.getByText('Uploaded audio assets copied independently: 1'),
    ).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
        preview: true,
        source: context.source,
        expectedBranchVersion: 4,
        blockIds: [id],
    });
    expect(context.onApplied).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole('button', { name: 'Copy into working draft' }),
    );
    await screen.findByRole('status');
    expect(calls[1]).toEqual({ ...calls[0], preview: false });
    expect(context.beforeApply).toHaveBeenCalledWith(destinationId);
    expect(context.onApplied).toHaveBeenCalledWith(destinationId, {
        ...branch,
        version: 5,
    });
});
it('retains one frozen operation for uncertain-copy retries without reporting false success', async () => {
    const requests: Record<string, unknown>[] = [];
    let failures = 1;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            if (url.endsWith('/workspace')) return Response.json({ workspace });
            const request = JSON.parse(String(init.body));
            requests.push(request);
            if (!request.preview && failures-- > 0)
                return Response.json(
                    {
                        error: {
                            code: 'service_unavailable',
                            message: 'Synthetic failure',
                            correlationId: 'copy-test',
                        },
                    },
                    { status: 503 },
                );
            return Response.json({
                branch: request.preview ? null : { ...branch, version: 5 },
                selectedCount: 1,
                blockCount: 1,
                dependencyCount: 0,
                mediaCount: 0,
                replayed: false,
            });
        }),
    );
    const { result } = renderHook(() =>
        useBlockCopy(context, [id], { noteId: destinationId, branchId }),
    );
    await act(async () => {
        await result.current.preview();
    });
    await act(async () => {
        await result.current.apply();
    });
    expect(result.current.error).toBe(true);
    expect(result.current.copied).toBe(false);
    await act(async () => {
        await result.current.apply();
    });
    expect(result.current.copied).toBe(true);
    expect(requests[2]).toEqual(requests[1]);
});

it.each([
    { action: 'Duplicate', kind: 'audio' },
    { action: 'Copy block', kind: 'audio' },
    { action: 'Duplicate', kind: 'exercise' },
    { action: 'Copy block', kind: 'exercise' },
])(
    'routes $kind $action through the authorized copy preview',
    async ({ action, kind }) => {
        const { KnowledgeEditor } =
            await import('../src/fsd/features/knowledge-notes');
        const { KnowledgeBodySchema } = await import('@languon/contracts');
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init: RequestInit) => {
                if (url.includes('/workspaces?'))
                    return Response.json({
                        workspaces: [
                            {
                                id: destinationId,
                                title: 'Destination',
                                status: 'draft',
                                hasUnsavedChanges: false,
                                updatedAt: branch.updatedAt,
                            },
                        ],
                        total: 1,
                        offset: 0,
                        limit: 50,
                    });
                if (url.endsWith('/workspace'))
                    return Response.json({ workspace });
                const request = JSON.parse(String(init.body));
                expect(request).toMatchObject({
                    branchId,
                    source: {
                        kind: 'owned-working',
                        noteId: destinationId,
                        branchId,
                        expectedVersion: 4,
                    },
                });
                expect(request.blockIds).toEqual(
                    kind === 'exercise'
                        ? ['44444444-4444-4444-8444-444444444444', id]
                        : [id],
                );
                return Response.json({
                    branch: null,
                    selectedCount: request.blockIds.length,
                    blockCount: request.blockIds.length,
                    dependencyCount: 0,
                    mediaCount: 1,
                    replayed: false,
                });
            }),
        );
        const audioId = '44444444-4444-4444-8444-444444444444';
        const segmentId = '55555555-5555-4555-8555-555555555555';
        const audio = LearningBlockSchema.parse({
            id: audioId,
            type: 'audio',
            title: 'Source recording',
            assetId: audioId,
            transcript: {
                language: 'en',
                segments: [
                    { id: segmentId, text: 'The train leaves at noon.' },
                ],
            },
        });
        const block = LearningBlockSchema.parse(
            kind === 'audio'
                ? {
                      id,
                      type: 'audio',
                      title: 'Uploaded recording',
                      assetId: id,
                  }
                : {
                      id,
                      type: 'exercise',
                      title: 'Uploaded recording',
                      format: 'free-text',
                      question: 'When?',
                      referenceAnswer: 'Noon',
                      explanation: 'The transcript says noon.',
                      source: { blockId: audioId, segmentIds: [segmentId] },
                  },
        );
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    { type: 'paragraph' },
                    ...(kind === 'exercise'
                        ? [{ type: 'learningBlock', attrs: { block: audio } }]
                        : []),
                    { type: 'learningBlock', attrs: { block } },
                ],
            },
        });
        const source = {
            kind: 'owned-working' as const,
            noteId: destinationId,
            branchId,
            expectedVersion: 4,
        };
        render(
            <KnowledgeEditor
                value={body}
                onChange={vi.fn()}
                workspace={{
                    toolbarRootId: 'audio-duplicate-toolbar',
                    editorId: 'audio-duplicate-editor',
                    proposalRootId: 'audio-duplicate-proposals',
                    onAskTutor: vi.fn(),
                    onAskOutline: vi.fn(),
                    blockCopy: {
                        ...context,
                        source,
                        beforeCopy: async () => source,
                    },
                }}
            />,
        );
        fireEvent.click(
            await screen.findByRole('button', {
                name:
                    kind === 'exercise'
                        ? 'Block settings: Source recording'
                        : 'Block settings: Uploaded recording',
            }),
        );
        const duplicate = await screen.findByRole('menuitem', {
            name: action,
        });
        expect(duplicate).toBeEnabled();
        fireEvent.click(duplicate);
        expect(
            await screen.findByRole('checkbox', { name: 'Uploaded recording' }),
        ).toBeChecked();
        if (action === 'Copy block') {
            await screen.findByRole('option', { name: 'Destination' });
            expect(
                screen.getByRole('button', { name: 'Preview copy' }),
            ).toBeDisabled();
            fireEvent.change(
                screen.getByRole('combobox', { name: 'Destination note' }),
                { target: { value: destinationId } },
            );
        }
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Preview copy' }),
            ).toBeEnabled(),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Preview copy' }));
        expect(
            await screen.findByText(
                'Uploaded audio assets copied independently: 1',
            ),
        ).toBeVisible();
    },
);
