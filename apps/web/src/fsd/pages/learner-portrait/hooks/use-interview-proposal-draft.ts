'use client';
import { useQueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type {
    PortraitItems,
    PortraitInterviewCompletedOperation,
    StartPortraitInterviewResponse,
} from '@languon/contracts';
import {
    portraitApi,
    setPortraitStateCache,
    type PortraitSessionRequest,
} from '@/fsd/entities/learner-portrait';
import {
    isInterviewOwner,
    ownerScopedInterviewRequest,
} from '../lib/interview-owner';
import type { InterviewLocale } from '../lib/interview-copy';
export function useInterviewProposalDraft({
    ownerId,
    proposal,
    locale,
    requestWithSession,
    onProposal,
    onSession,
    onError,
}: {
    ownerId: string | null;
    proposal: PortraitInterviewCompletedOperation | null;
    locale: InterviewLocale;
    requestWithSession: PortraitSessionRequest;
    onProposal(proposal: PortraitInterviewCompletedOperation | null): void;
    onSession: Dispatch<SetStateAction<StartPortraitInterviewResponse | null>>;
    onError(message: string): void;
}) {
    const client = useQueryClient();
    async function accept(editedItems?: PortraitItems) {
        if (!proposal?.result.proposedItems || !isInterviewOwner(ownerId))
            return;
        const request = ownerScopedInterviewRequest(
            ownerId,
            requestWithSession,
        );
        try {
            const current = await request((token) => portraitApi.read(token));
            if (
                current.version !== proposal.baseVersion ||
                current.generation !== proposal.baseGeneration
            ) {
                onError(
                    'Your portrait changed. Review this proposal against the latest portrait before saving.',
                );
                return;
            }
            const updated = await request((token) =>
                portraitApi.saveDraft(token, {
                    expectedVersion: current.version,
                    baseApprovedVersion: current.approvedVersion,
                    items: editedItems ?? proposal.result.proposedItems!,
                    locale,
                }),
            );
            setPortraitStateCache(client, ownerId, updated);
            onProposal(null);
            onSession((previous) =>
                previous
                    ? {
                          ...previous,
                          context: {
                              ...previous.context,
                              draftItems: updated.draft!.items,
                          },
                      }
                    : previous,
            );
        } catch {
            if (!isInterviewOwner(ownerId)) return;
            onError(
                'Unable to add this proposal. Review the latest portrait; your draft is kept.',
            );
        }
    }
    return accept;
}
