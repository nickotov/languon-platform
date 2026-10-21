'use client';
import { useRef, type Dispatch, type SetStateAction } from 'react';
import type { StartPortraitInterviewResponse } from '@languon/contracts';
import {
    portraitApi,
    type PortraitSessionRequest,
} from '@/fsd/entities/learner-portrait';
import {
    isInterviewOwner,
    ownerScopedInterviewRequest,
} from '../lib/interview-owner';

/** Locale is an independent manual action; only the latest local choice updates the view. */
export function useInterviewLocale({
    ownerId,
    session,
    requestWithSession,
    onSession,
    onError,
}: {
    ownerId: string | null;
    session: StartPortraitInterviewResponse | null;
    requestWithSession: PortraitSessionRequest;
    onSession: Dispatch<SetStateAction<StartPortraitInterviewResponse | null>>;
    onError(message: string): void;
}) {
    const revision = useRef(0);
    async function switchLocale(
        next: StartPortraitInterviewResponse['context']['locale'],
    ) {
        if (!session || !isInterviewOwner(ownerId)) return;
        const sequence = ++revision.current;
        const request = ownerScopedInterviewRequest(
            ownerId,
            requestWithSession,
        );
        try {
            const current = await request((token) => portraitApi.read(token));
            const updated = await request((token) =>
                portraitApi.setInterviewLocale(token, {
                    interviewId: session.interviewId,
                    expectedVersion: current.version,
                    locale: next,
                }),
            );
            if (sequence !== revision.current) return;
            onSession({ ...session, ...updated });
        } catch {
            if (!isInterviewOwner(ownerId) || sequence !== revision.current)
                return;
            onError(
                'Unable to change the interview language. Your answers are kept.',
            );
        }
    }
    return switchLocale;
}
