import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useAssistantNavigation } from '../src/fsd/widgets/contextual-assistant/hooks/use-assistant-navigation';

it('guards invalid or unsaved drafts across close/history/new actions, and permits leaving only after save or explicit discard', () => {
    const leave = vi.fn();
    const { result } = renderHook(useAssistantNavigation);
    act(() => result.current.draftDirty('draft-one', true));
    act(() => result.current.draftDirty('draft-two', true));
    act(() => result.current.navigation.request(leave));
    expect(leave).not.toHaveBeenCalled();
    expect(result.current.navigation.open).toBe(true);
    act(() => result.current.navigation.keepEditing());
    expect(result.current.navigation.dirty).toBe(true);
    act(() => result.current.draftDirty('draft-one', false));
    act(() => result.current.navigation.request(leave));
    expect(leave).not.toHaveBeenCalled();
    act(() => result.current.navigation.discard());
    expect(leave).toHaveBeenCalledOnce();
    expect(result.current.discardRevision).toBe(1);
    act(() => result.current.draftDirty('draft-two', false));
    act(() => result.current.navigation.request(leave));
    expect(leave).toHaveBeenCalledTimes(2);
});
