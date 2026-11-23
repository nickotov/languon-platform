import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type {
    KnowledgeContentProposal,
    KnowledgeNode,
} from '@languon/contracts';
import { ConversationApiError } from '../src/fsd/entities/conversation';
import { contentProposalsApi } from '../src/fsd/features/knowledge-notes/api/content-proposals-api';
import { useInsertLessonCopy } from '../src/fsd/features/knowledge-notes/hooks/use-insert-lesson-copy';

it('reconciles once after a rejected version and retries only with a fresh revision and intent', async () => {
    const branchId = crypto.randomUUID();
    const proposal: KnowledgeContentProposal = {
        id: crypto.randomUUID(),
        conversationId: crypto.randomUUID(),
        noteId: crypto.randomUUID(),
        branchId,
        baseBranchVersion: 1,
        body: {
            schemaVersion: 2,
            document: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
        lessonParts: [
            {
                taskId: 'reading',
                kind: 'prose',
                startIndex: 0,
                nodeCount: 1,
                present: false,
            },
        ],
        appliedAt: null,
        appliedBranchVersion: null,
        createdAt: new Date().toISOString(),
    };
    const apply = vi
        .spyOn(contentProposalsApi, 'apply')
        .mockRejectedValueOnce(
            new ConversationApiError(409, {
                code: 'version_conflict',
                message: 'Draft changed',
                correlationId: 'test',
            }),
        )
        .mockResolvedValueOnce({
            proposal,
            branch: { id: branchId, version: 4 },
        } as Awaited<ReturnType<typeof contentProposalsApi.apply>>);
    const read = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(3);
    const { result } = renderHook(() => {
        const [version, setVersion] = useState(2);

        return useInsertLessonCopy({
            proposal,
            disabled: false,
            onApplied: vi.fn(),
            context: {
                branchId,
                branchVersion: version,
                conversationId: proposal.conversationId,
                requestWithSession: vi.fn(),
                beforeApply: async () => ({ branchId, version }),
                onApplied: vi.fn(),
                refreshLessonDraft: async () => {
                    setVersion(await read());
                },
            },
        });
    });

    await act(async () => result.current.insertLesson('reading', 'end'));
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.canInsertLesson).toBe(false);
    expect(result.current.canRefreshLessonDraft).toBe(true);
    await act(async () => result.current.insertLesson('reading', 'end'));
    expect(apply).toHaveBeenCalledTimes(1);
    await act(async () => result.current.refreshLessonDraft());
    expect(result.current.canInsertLesson).toBe(true);
    await act(async () => result.current.insertLesson('reading', 'end'));
    expect(apply.mock.calls.map((call) => call[3])).toEqual([2, 3]);
    expect(apply.mock.calls[0]?.[6]?.requestId).not.toEqual(
        apply.mock.calls[1]?.[6]?.requestId,
    );

    expect(result.current.lessonInsertStatus).toEqual({
        taskId: 'reading',
        placement: 'end',
    });

    apply.mockRestore();
});

it('uses the live working document to prevent duplicates and re-enables insertion on removal before autosave', async () => {
    const branchId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const text: KnowledgeNode = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Le vote.' }],
    };
    const proposal: KnowledgeContentProposal = {
        id,
        conversationId: crypto.randomUUID(),
        noteId: crypto.randomUUID(),
        branchId,
        baseBranchVersion: 1,
        body: { schemaVersion: 2, document: { type: 'doc', content: [text] } },
        lessonParts: [
            {
                taskId: 'reading',
                kind: 'prose',
                startIndex: 0,
                nodeCount: 1,
                present: true,
            },
        ],
        appliedAt: null,
        appliedBranchVersion: null,
        createdAt: new Date().toISOString(),
    };
    const beforeApply = vi.fn(async () => ({ branchId, version: 2 }));
    const bookmark = { resolve: () => 14, release: vi.fn() };
    const apply = vi.spyOn(contentProposalsApi, 'apply').mockResolvedValue({
        proposal,
        branch: { id: branchId, version: 3 },
    } as Awaited<ReturnType<typeof contentProposalsApi.apply>>);

    const current: KnowledgeNode = {
        type: 'doc',
        content: [{ ...text, attrs: { lessonPartId: `${id}/reading` } }],
    };
    const { result, rerender } = renderHook(
        (workingDocument: KnowledgeNode) =>
            useInsertLessonCopy({
                proposal,
                disabled: false,
                onApplied: vi.fn(),
                context: {
                    branchId,
                    branchVersion: 2,
                    conversationId: proposal.conversationId,
                    workingDocument,
                    requestWithSession: vi.fn(),
                    beforeApply,
                    onApplied: vi.fn(),
                    captureInsertion: () => bookmark,
                },
            }),
        { initialProps: current },
    );

    expect(result.current.isPartPresent('reading')).toBe(true);
    expect(result.current.canInsertLesson).toBe(false);
    await act(() => result.current.insertLesson(undefined, 'end'));
    await act(() => result.current.insertLesson('reading', 'cursor'));
    expect(beforeApply).not.toHaveBeenCalled();

    rerender({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(result.current.isPartPresent('reading')).toBe(false);
    expect(result.current.canInsertLesson).toBe(true);
    await act(() => result.current.insertLesson('reading', 'cursor'));
    expect(apply.mock.calls[0]?.slice(3)).toEqual([
        2,
        'insert-lesson',
        14,
        {
            requestId: expect.any(String),
            taskId: 'reading',
        },
    ]);

    expect(bookmark.release).toHaveBeenCalledOnce();
    apply.mockRestore();
});

it('replays an ambiguous insert at its original position but creates a new intent after a later removal', async () => {
    const branchId = crypto.randomUUID();
    const proposal: KnowledgeContentProposal = {
        id: crypto.randomUUID(),
        branchId,
        conversationId: crypto.randomUUID(),
        noteId: crypto.randomUUID(),
        baseBranchVersion: 1,
        body: {
            schemaVersion: 2,
            document: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
        lessonParts: [
            {
                taskId: 'reading',
                kind: 'prose',
                startIndex: 0,
                nodeCount: 1,
                present: false,
            },
        ],
        appliedAt: null,
        appliedBranchVersion: null,
        createdAt: new Date().toISOString(),
    };
    const apply = vi
        .spyOn(contentProposalsApi, 'apply')
        .mockRejectedValue(new Error('connection lost'));
    let position = 6;
    const { result, rerender } = renderHook(
        (version: number) =>
            useInsertLessonCopy({
                proposal,
                disabled: false,
                onApplied: vi.fn(),
                context: {
                    branchId,
                    branchVersion: version,
                    conversationId: proposal.conversationId,
                    requestWithSession: vi.fn(),
                    onApplied: vi.fn(),
                    beforeApply: async () => ({ branchId, version }),
                    captureInsertion: () => ({
                        resolve: () => position,
                        release: vi.fn(),
                    }),
                },
            }),
        { initialProps: 2 },
    );

    await act(() => result.current.insertLesson('reading', 'cursor'));
    position = 9;
    await act(() => result.current.insertLesson('reading', 'cursor'));
    expect(apply.mock.calls[0]?.slice(3)).toEqual(
        apply.mock.calls[1]?.slice(3),
    );

    rerender(4);
    await act(() => result.current.insertLesson('reading', 'cursor'));
    expect(apply.mock.calls[2]?.[5]).toBe(9);
    expect(apply.mock.calls[2]?.[6]?.requestId).not.toBe(
        apply.mock.calls[0]?.[6]?.requestId,
    );

    apply.mockRestore();
});
