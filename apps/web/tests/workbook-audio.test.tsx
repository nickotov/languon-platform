import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeBody } from '@languon/contracts';
import { useNoteAudio } from '@/fsd/features/workbook-learning/hooks/use-note-audio';
import { readKnowledgeAudio } from '@/fsd/entities/knowledge';
vi.mock('@/fsd/entities/knowledge', () => ({ readKnowledgeAudio: vi.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const body: KnowledgeBody = {
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: [
            {
                type: 'learningBlock',
                attrs: { block: { id, type: 'audio', assetId } },
            },
        ],
    },
};
const access = {
    kind: 'workbook' as const,
    locator: 'a'.repeat(32),
    key: 'b'.repeat(43),
};
const requestWithSession = <T,>(operation: (token: string) => Promise<T>) =>
    operation('token');
const createObjectURL = vi
    .fn()
    .mockReturnValue('blob:http://localhost/test-audio');
const revokeObjectURL = vi.fn();
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
        'URL',
        Object.assign(URL, { createObjectURL, revokeObjectURL }),
    );
    vi.mocked(readKnowledgeAudio).mockResolvedValue(
        new Blob(['audio'], { type: 'audio/wav' }),
    );
});
afterEach(() => vi.unstubAllGlobals());
describe('authorized audio lifecycle', () => {
    it('uses a public source grant for anonymous bytes and revokes the ephemeral player URL', async () => {
        const { result, unmount } = renderHook(() =>
            useNoteAudio({
                noteId: id,
                body,
                access,
                actorId: undefined,
                requestWithSession,
                unavailable: false,
            }),
        );
        await waitFor(() =>
            expect(result.current[assetId]).toBe(
                'blob:http://localhost/test-audio',
            ),
        );
        expect(vi.mocked(readKnowledgeAudio).mock.calls[0]![2]).toMatchObject({
            access,
        });
        expect(
            vi.mocked(readKnowledgeAudio).mock.calls[0]![2],
        ).not.toHaveProperty('token');
        unmount();
        expect(revokeObjectURL).toHaveBeenCalledWith(
            'blob:http://localhost/test-audio',
        );
    });
    it('removes player URLs when source access becomes unavailable', async () => {
        const { result, rerender } = renderHook(
            ({ unavailable }) =>
                useNoteAudio({
                    noteId: id,
                    body,
                    access,
                    actorId: 'actor',
                    requestWithSession,
                    unavailable,
                }),
            { initialProps: { unavailable: false } },
        );
        await waitFor(() => expect(result.current[assetId]).toBeDefined());
        rerender({ unavailable: true });
        expect(result.current).toEqual({});
        expect(revokeObjectURL).toHaveBeenCalledWith(
            'blob:http://localhost/test-audio',
        );
    });
});
