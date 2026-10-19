import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useConversationDeletion } from '@/fsd/widgets/contextual-assistant/hooks/use-conversation-deletion';

it('locks repeated confirmation, cancel, and target changes until deletion finishes', async () => {
    let resolve!: () => void;
    const remove = vi.fn(
        () =>
            new Promise<void>((done) => {
                resolve = done;
            }),
    );
    const onDeleted = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
        useConversationDeletion({ remove, onDeleted, onError }),
    );
    act(() => result.current.requestDelete('first'));
    let deletion!: Promise<void>;
    act(() => {
        deletion = result.current.confirmDelete();
        void result.current.confirmDelete();
        result.current.cancelDelete();
        result.current.requestDelete('second');
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('first');
    expect(result.current.deletingPending).toBe(true);
    expect(result.current.deleting).toBe('first');
    await act(async () => {
        resolve();
        await deletion;
    });
    expect(result.current.deleting).toBeNull();
    expect(result.current.deletingPending).toBe(false);
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
});
it('retains the target on failure and allows explicit retry', async () => {
    const error = new Error('offline');
    const remove = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
        useConversationDeletion({ remove, onDeleted, onError }),
    );
    act(() => result.current.requestDelete('first'));
    await act(async () => {
        await result.current.confirmDelete();
    });
    expect(result.current.deleting).toBe('first');
    expect(result.current.deletingPending).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    await act(async () => {
        await result.current.confirmDelete();
    });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(result.current.deleting).toBeNull();
    expect(onDeleted).toHaveBeenCalledTimes(1);
});
