import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type {
    KnowledgeNoteContent,
    KnowledgeWorkspace,
} from '@languon/contracts';

const mocks = vi.hoisted(() => ({
    workspace: vi.fn(),
    updateWorking: vi.fn(),
    resolveWorking: vi.fn(),
}));

vi.mock('../src/fsd/entities/knowledge', () => ({ knowledgeApi: mocks }));
vi.mock('../src/fsd/entities/session', () => ({
    useSessionStore: (selector: (state: unknown) => unknown) =>
        selector({ user: { id: 'owner' } }),
}));
vi.mock('../src/fsd/features/auth', () => ({
    useAuth: () => ({
        requestWithSession: (run: (token: string) => unknown) => run('token'),
    }),
}));

import { useKnowledgeWorkspace } from '../src/fsd/pages/knowledge/hooks/use-knowledge-workspace';

const content: KnowledgeNoteContent = {
    title: 'Untitled',
    summary: '',
    categories: [],
    studiedLanguage: null,
    explanationLanguage: null,
    body: {
        schemaVersion: 1,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((settle) => {
        resolve = settle;
    });
    return { promise, resolve };
}

describe('working draft recovery', () => {
    it('shows the second edit as unsaved until its own request completes', async () => {
        mocks.workspace.mockReset();
        mocks.updateWorking.mockReset();
        const first = deferred<{
            branch: KnowledgeWorkspace['branches'][number];
            branches: KnowledgeWorkspace['branches'];
            conflict: boolean;
        }>();
        const branch = {
            id: 'branch',
            noteId: 'note',
            version: 1,
            basePublishedVersion: 0,
            content,
            updatedAt: '2026-10-19T00:00:00.000Z',
        };
        mocks.workspace.mockResolvedValue({
            noteId: 'note',
            status: 'draft',
            published: null,
            branches: [branch],
            preferredBranchId: branch.id,
            shareEnabled: false,
            limits: { referenceChars: 40_000, editorChars: 40_000 },
        } satisfies KnowledgeWorkspace);
        mocks.updateWorking
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(
                (
                    _: string,
                    __: string,
                    input: { content: KnowledgeNoteContent },
                ) => {
                    const saved = {
                        ...branch,
                        version: 3,
                        content: input.content,
                    };
                    return Promise.resolve({
                        branch: saved,
                        branches: [saved],
                        conflict: false,
                    });
                },
            );
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
        }
        const { result } = renderHook(() => useKnowledgeWorkspace('note'), {
            wrapper,
        });
        await waitFor(() => expect(result.current.edit).not.toBeNull());

        act(() =>
            result.current.change((current) => ({
                ...current,
                title: 'First edit',
            })),
        );
        let firstSave!: Promise<boolean>;
        act(() => {
            firstSave = result.current.retryRecovery();
        });
        act(() =>
            result.current.change((current) => ({
                ...current,
                title: 'Second edit',
            })),
        );
        await act(async () => {
            const saved = {
                ...branch,
                version: 2,
                content: { ...content, title: 'First edit' },
            };
            first.resolve({
                branch: saved,
                branches: [saved],
                conflict: false,
            });
            await firstSave;
        });
        expect(result.current.status).toBe('unsaved');
        expect(result.current.edit?.content.title).toBe('Second edit');
        expect(result.current.edit?.synced.title).toBe('First edit');

        await act(async () => {
            await result.current.retryRecovery();
        });
        expect(result.current.status).toBe('saved');
        expect(result.current.edit?.synced.title).toBe('Second edit');
    });

    it('automatically saves rapid title and body edits together', async () => {
        mocks.workspace.mockReset();
        mocks.updateWorking.mockReset();
        const branch = {
            id: 'branch',
            noteId: 'note',
            version: 1,
            basePublishedVersion: 0,
            content,
            updatedAt: '2026-10-19T00:00:00.000Z',
        };
        mocks.workspace.mockResolvedValue({
            noteId: 'note',
            status: 'draft',
            published: null,
            branches: [branch],
            preferredBranchId: branch.id,
            shareEnabled: false,
            limits: { referenceChars: 40_000, editorChars: 40_000 },
        } satisfies KnowledgeWorkspace);
        mocks.updateWorking.mockImplementation(
            (
                _: string,
                __: string,
                input: { content: KnowledgeNoteContent },
            ) => {
                const saved = { ...branch, version: 2, content: input.content };
                return Promise.resolve({
                    branch: saved,
                    branches: [saved],
                    conflict: false,
                });
            },
        );
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
        }
        const { result } = renderHook(() => useKnowledgeWorkspace('note'), {
            wrapper,
        });
        await waitFor(() => expect(result.current.edit).not.toBeNull());

        act(() => {
            result.current.change((current) => ({
                ...current,
                title: 'A title',
            }));
            result.current.change((current) => ({
                ...current,
                body: {
                    schemaVersion: 1,
                    document: {
                        type: 'doc',
                        content: [
                            {
                                type: 'paragraph',
                                content: [{ type: 'text', text: 'Body' }],
                            },
                        ],
                    },
                },
            }));
        });
        await waitFor(
            () => expect(mocks.updateWorking).toHaveBeenCalledTimes(1),
            { timeout: 3_000 },
        );
        await waitFor(() => expect(result.current.status).toBe('saved'));
        expect(result.current.edit?.content.title).toBe('A title');
        expect(
            result.current.edit?.content.body.document.content?.[0]
                ?.content?.[0]?.text,
        ).toBe('Body');
    });

    it('shows restored alternatives and adopts the rebased branch version after resolution', async () => {
        mocks.workspace.mockReset();
        mocks.updateWorking.mockReset();
        mocks.resolveWorking.mockReset();
        const working = {
            id: 'working',
            noteId: 'note',
            version: 2,
            basePublishedVersion: 1,
            content: { ...content, title: 'Unpublished wording' },
            updatedAt: '2026-10-19T00:00:00.000Z',
        };
        const restored = {
            ...working,
            id: 'restored',
            version: 1,
            basePublishedVersion: 2,
            content: { ...content, title: 'Restored wording' },
        };
        const published = {
            ...restored.content,
            id: 'note',
            version: 2,
            createdAt: '2026-10-19T00:00:00.000Z',
            updatedAt: '2026-10-19T00:00:00.000Z',
        };
        const initial = {
            noteId: 'note',
            status: 'saved',
            published: { ...published, version: 1 },
            branches: [working],
            preferredBranchId: working.id,
            shareEnabled: false,
            limits: { referenceChars: 40_000, editorChars: 40_000 },
        } satisfies KnowledgeWorkspace;
        const afterRestore = {
            ...initial,
            published,
            branches: [working, restored],
        } satisfies KnowledgeWorkspace;
        const rebased = {
            ...working,
            version: 3,
            basePublishedVersion: 2,
        };
        mocks.workspace
            .mockResolvedValueOnce(initial)
            .mockResolvedValueOnce(afterRestore);
        mocks.resolveWorking.mockResolvedValue({
            ...afterRestore,
            branches: [rebased],
        } satisfies KnowledgeWorkspace);
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
        }
        const { result } = renderHook(() => useKnowledgeWorkspace('note'), {
            wrapper,
        });
        await waitFor(() => expect(result.current.edit).not.toBeNull());

        await act(async () => {
            await result.current.reload();
        });
        expect(result.current.workspace?.branches).toHaveLength(2);
        expect(result.current.edit?.content.title).toBe('Unpublished wording');
        await act(async () => {
            await result.current.resolveCurrent();
        });
        expect(mocks.resolveWorking).toHaveBeenCalledWith(
            'token',
            'note',
            expect.objectContaining({
                keepBranchId: 'working',
                keepVersion: 2,
                discardBranches: [{ id: 'restored', expectedVersion: 1 }],
            }),
        );
        expect(result.current.workspace?.branches).toHaveLength(1);
        expect(result.current.edit?.version).toBe(3);
        expect(result.current.edit?.content.title).toBe('Unpublished wording');
    });
});
