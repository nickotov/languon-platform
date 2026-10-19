import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { usePublishedKnowledge } from '../src/fsd/widgets/contextual-assistant/hooks/use-published-knowledge';

it('keeps a late publication in its conversation and leaves another draft editor open', () => {
    const { result, rerender } = renderHook(
        ({ conversationId }: { conversationId: string }) => {
            const [editing, setEditing] = useState<string | null>('draft-a');
            return {
                ...usePublishedKnowledge(conversationId, setEditing),
                editing,
                setEditing,
            };
        },
        { initialProps: { conversationId: 'conversation-a' } },
    );
    const lateCompletion = result.current.publishedNote;
    rerender({ conversationId: 'conversation-b' });
    act(() => result.current.setEditing('draft-b'));
    act(() => lateCompletion('note-a', 'Note A', 'conversation-a', 'draft-a'));
    expect(result.current.published).toBeUndefined();
    expect(result.current.editing).toBe('draft-b');
    rerender({ conversationId: 'conversation-a' });
    expect(result.current.published).toEqual({ id: 'note-a', title: 'Note A' });
    expect(result.current.editing).toBe('draft-b');
});

it('closes only the editor for the draft that was successfully published', () => {
    const { result } = renderHook(() => {
        const [editing, setEditing] = useState<string | null>('draft-a');
        return {
            ...usePublishedKnowledge('conversation-a', setEditing),
            editing,
        };
    });
    act(() =>
        result.current.publishedNote(
            'note-a',
            'Note A',
            'conversation-a',
            'draft-a',
        ),
    );
    expect(result.current.editing).toBeNull();
    expect(result.current.published).toEqual({ id: 'note-a', title: 'Note A' });
});
