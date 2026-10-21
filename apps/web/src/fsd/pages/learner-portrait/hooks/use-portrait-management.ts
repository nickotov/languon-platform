'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { PortraitState } from '@languon/contracts';
import {
    invalidatePortraitInterviewStatusCache,
    portraitApi,
    PortraitApiError,
    setPortraitStateCache,
    usePortraitInterviewStatus,
    usePortraitState,
    ownerScopedPortraitRequest,
} from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';

type OwnerScope = { ownerId: string | null };
type MutationRequest = { scope: OwnerScope };
type MutationState = {
    request: MutationRequest;
    pending: boolean;
    error: unknown;
};

export function usePortraitManagement() {
    const ownerId = useSessionStore((state) => state.user?.id ?? null);
    const { requestWithSession: sessionRequest } = useAuth();
    const requestWithSession = ownerScopedPortraitRequest(
        ownerId,
        sessionRequest,
        () => useSessionStore.getState().user?.id ?? null,
    );
    const client = useQueryClient();
    const query = usePortraitState({ ownerId, requestWithSession });
    const status = usePortraitInterviewStatus({ ownerId, requestWithSession });
    const scopeRef = useRef<OwnerScope>({ ownerId });
    if (scopeRef.current.ownerId !== ownerId) scopeRef.current = { ownerId };
    const scope = scopeRef.current;
    const activeRequest = useRef<MutationRequest | null>(null);
    const [mutation, setMutation] = useState<MutationState | null>(null);
    const currentMutation = mutation?.request.scope === scope ? mutation : null;
    const pending = currentMutation?.pending ?? false;
    const error = currentMutation?.error ?? null;

    async function apply(action: (token: string) => Promise<PortraitState>) {
        if (
            !ownerId ||
            scopeRef.current !== scope ||
            activeRequest.current?.scope === scope
        )
            return null;
        const request = { scope };
        activeRequest.current = request;
        setMutation({ request, pending: true, error: null });
        function ownsRequest() {
            return (
                activeRequest.current === request &&
                scopeRef.current === scope &&
                useSessionStore.getState().user?.id === ownerId
            );
        }
        try {
            const state = await requestWithSession(action);
            if (!ownsRequest()) return null;
            setPortraitStateCache(client, ownerId, state);
            await Promise.all([
                invalidatePortraitInterviewStatusCache(client, ownerId),
                client.invalidateQueries({
                    queryKey: ['conversations', ownerId],
                }),
                client.invalidateQueries({
                    queryKey: ['conversation', ownerId],
                }),
            ]);
            return ownsRequest() ? state : null;
        } catch (cause) {
            if (ownsRequest()) {
                setMutation({ request, pending: true, error: cause });
                if (
                    cause instanceof PortraitApiError &&
                    cause.code === 'version_conflict'
                ) {
                    await query.refetch();
                    await status.refetch();
                }
            }
            return null;
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

    async function discard() {
        if (!query.data) return null;
        return apply((token) =>
            portraitApi.discard(token, { expectedVersion: query.data.version }),
        );
    }

    async function setUse(enabled: boolean) {
        if (!query.data) return null;
        return apply((token) =>
            portraitApi.setUse(token, {
                expectedVersion: query.data.version,
                enabled,
            }),
        );
    }

    return {
        ownerId,
        requestWithSession,
        client,
        query,
        status,
        pending,
        error,
        apply,
        discard,
        setUse,
    };
}
export type PortraitManagement = ReturnType<typeof usePortraitManagement>;
