'use client';
import { useEffect, useRef, useState } from 'react';
import type { KnowledgeBlockProposal } from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { useSessionStore } from '@/fsd/entities/session';
import { useKnowledgeAudioUrls } from '@/fsd/entities/knowledge';

/** Prepare visible previews, not the entire historic conversation's media. */
export function useProposalAudio(
    proposal: KnowledgeBlockProposal,
    requestWithSession: ConversationSessionRequest,
    review: boolean,
) {
    const ref = useRef<HTMLElement>(null);
    const [seen, setSeen] = useState(false);
    const actorId = useSessionStore((state) => state.user?.id);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        if (typeof IntersectionObserver === 'undefined') {
            setSeen(true);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setSeen(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const assetIds = [
        ...proposal.blocks,
        ...(proposal.dependencies ?? []),
    ].flatMap((block) =>
        block.type === 'audio' && block.assetId ? [block.assetId] : [],
    );
    const urls = useKnowledgeAudioUrls({
        noteId: proposal.noteId,
        assetIds,
        actorId,
        access: undefined,
        requestWithSession,
        unavailable: !seen && !review,
    });
    return { ref, urls };
}
