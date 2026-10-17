import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextDocument } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import { useTextWorkspaceSave } from '@/fsd/pages/texts/hooks/use-text-workspace-save';
import type { WorkspaceInput } from '@/fsd/pages/texts/lib/workspace-content';

const id = '123e4567-e89b-42d3-a456-426614174000';
const input: WorkspaceInput = {
    title: 'Reading',
    sourceText: 'A sentence.',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
};
const document = { id, folderId: id, version: 1, ...input } as TextDocument;

function options(current = input) {
    return {
        request: <T,>(operation: (token: string) => Promise<T>) =>
            operation('test-token'),
        folderId: id,
        document,
        input: current,
        mode: 'compose' as const,
        pairs: [],
        proposal: null,
        previewExpired: false,
        conflict: null,
        setShowErrors: vi.fn(),
        setExpired: vi.fn(),
        setConflict: vi.fn(),
        setDocument: vi.fn(),
        adopt: vi.fn(),
        clearProposal: vi.fn(),
    };
}

afterEach(() => vi.restoreAllMocks());

describe('workspace error recovery', () => {
    it('hides a save failure when the failed content has been corrected', async () => {
        const error = new Error('Temporary failure');
        vi.spyOn(textsApi, 'saveText').mockRejectedValue(error);
        const { result, rerender } = renderHook(
            ({ current }) => useTextWorkspaceSave(options(current)),
            { initialProps: { current: input } },
        );

        await act(() => result.current.save());
        expect(result.current.saveError).toBe(error);
        rerender({
            current: { ...input, sourceText: 'A corrected sentence.' },
        });
        expect(result.current.saveError).toBeNull();
    });

    it('clears previous validation state once a corrected save is admitted', async () => {
        vi.spyOn(textsApi, 'saveText').mockResolvedValue({ text: document });
        const config = options();
        const { result, rerender } = renderHook(
            ({ current }) =>
                useTextWorkspaceSave({ ...config, input: current }),
            { initialProps: { current: { ...input, sourceText: '' } } },
        );

        await act(() => result.current.save());
        expect(config.setShowErrors).toHaveBeenLastCalledWith(true);
        rerender({ current: input });
        await act(() => result.current.save());
        expect(config.setShowErrors).toHaveBeenLastCalledWith(false);
        expect(config.adopt).toHaveBeenCalledWith(document);
    });

    it('explicitly clears a save failure before starting a new translation', async () => {
        vi.spyOn(textsApi, 'saveText').mockRejectedValue(new Error('Failed'));
        const { result } = renderHook(() => useTextWorkspaceSave(options()));
        await act(() => result.current.save());
        expect(result.current.saveError).not.toBeNull();

        act(() => result.current.clearSaveError());
        expect(result.current.saveError).toBeNull();
    });
});
