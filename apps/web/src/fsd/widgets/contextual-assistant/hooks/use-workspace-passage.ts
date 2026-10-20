import { useEffect, useRef, useState } from 'react';
import type { WorkspaceAssistantProps } from '../types';

export type WorkspacePendingPassage = {
    id: string;
    content: string;
    targetId?: string | undefined;
};

/** An editor selection belongs to one composer and never consumes copied-reference allowance. */
export function useWorkspacePassage(
    request: WorkspaceAssistantProps['request'],
    conversationId: string | null,
) {
    const [passage, setPassage] = useState<WorkspacePendingPassage | null>(
        null,
    );
    const lastRequest = useRef<string | null>(null);
    const lastConversation = useRef(conversationId);
    useEffect(() => {
        if (
            lastConversation.current &&
            lastConversation.current !== conversationId
        )
            setPassage(null);
        lastConversation.current = conversationId;
    }, [conversationId]);
    useEffect(() => {
        if (!request || lastRequest.current === request.id) return;
        lastRequest.current = request.id;
        if (request.passage)
            setPassage({
                id: request.id,
                content: request.passage,
                targetId: request.targetId,
            });
        else setPassage(null);
    }, [request]);
    function remove() {
        setPassage(null);
    }
    function sent(id?: string) {
        setPassage((current) => (current?.id === id ? null : current));
    }
    return { passage, remove, sent };
}
