import { useState, type Dispatch, type SetStateAction } from 'react';

export function usePublishedKnowledge(
    conversationId: string | null,
    setEditingDraft: Dispatch<SetStateAction<string | null>>,
) {
    const [notes, setNotes] = useState<
        Record<string, { id: string; title: string }>
    >({});
    function publishedNote(
        id: string,
        title: string,
        sourceConversationId: string,
        draftId: string,
    ) {
        setNotes((previous) => ({
            ...previous,
            [sourceConversationId]: { id, title },
        }));
        setEditingDraft((current) => (current === draftId ? null : current));
    }
    const published = conversationId ? notes[conversationId] : undefined;
    return { published, publishedNote };
}
