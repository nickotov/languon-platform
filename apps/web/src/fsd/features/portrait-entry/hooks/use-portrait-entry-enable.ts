'use client';

import type { PortraitState } from '@languon/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
    portraitApi,
    setPortraitStateCache,
    type PortraitSessionRequest,
} from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';

type OwnerScope = { ownerId: string | null };
type EnableRequest = { scope: OwnerScope };
type EnableState = {
    request: EnableRequest;
    pending: boolean;
    failed: boolean;
};

export function usePortraitEntryEnable({
    ownerId,
    state,
    requestWithSession,
}: {
    ownerId: string | null;
    state: PortraitState | undefined;
    requestWithSession: PortraitSessionRequest;
}) {
    const client = useQueryClient();
    const scopeRef = useRef<OwnerScope>({ ownerId });
    if (scopeRef.current.ownerId !== ownerId) scopeRef.current = { ownerId };
    const scope = scopeRef.current;
    const activeRequest = useRef<EnableRequest | null>(null);
    const [mutation, setMutation] = useState<EnableState | null>(null);
    const currentMutation = mutation?.request.scope === scope ? mutation : null;
    const pending = currentMutation?.pending ?? false;
    const failed = currentMutation?.failed ?? false;

    async function enable() {
        if (
            !ownerId ||
            !state ||
            scopeRef.current !== scope ||
            activeRequest.current?.scope === scope
        )
            return;
        const request = { scope };
        activeRequest.current = request;
        setMutation({ request, pending: true, failed: false });
        function ownsRequest() {
            return (
                activeRequest.current === request &&
                scopeRef.current === scope &&
                useSessionStore.getState().user?.id === ownerId
            );
        }
        try {
            const next = await requestWithSession((token) =>
                portraitApi.setUse(token, {
                    expectedVersion: state.version,
                    enabled: true,
                }),
            );
            if (!ownsRequest()) return;
            setPortraitStateCache(client, ownerId, next);
            await Promise.all([
                client.invalidateQueries({
                    queryKey: ['conversations', ownerId],
                }),
                client.invalidateQueries({
                    queryKey: ['conversation', ownerId],
                }),
            ]);
        } catch {
            if (ownsRequest())
                setMutation({ request, pending: true, failed: true });
        } finally {
            if (ownsRequest()) {
                activeRequest.current = null;
                setMutation((current) =>
                    current?.request === request
                        ? { ...current, pending: false }
                        : current,
                );
            }
        }
    }

    return { pending, failed, enable };
}
