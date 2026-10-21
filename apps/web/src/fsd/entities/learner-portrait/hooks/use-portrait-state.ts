'use client';

import type { PortraitState } from '@languon/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { portraitApi, type PortraitSessionRequest } from '../api/portrait-api';
import {
    portraitQueryKey,
    portraitInterviewStatusQueryKey,
} from '../lib/portrait-query-cache';

type PortraitQueryOptions = {
    ownerId: string | null;
    requestWithSession: PortraitSessionRequest;
    enabled?: boolean;
};

export function usePortraitState({
    ownerId,
    requestWithSession,
    enabled = true,
}: PortraitQueryOptions) {
    const queryClient = useQueryClient();
    const queryKey = portraitQueryKey(ownerId);
    return useQuery({
        queryKey,
        queryFn: async ({ signal }) => {
            const state = await requestWithSession((token) =>
                portraitApi.read(token, signal),
            );
            const current = queryClient.getQueryData<PortraitState>(queryKey);
            if (current && current.version > state.version) return current;
            return state;
        },
        enabled: enabled && ownerId !== null,
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });
}

export function usePortraitInterviewStatus({
    ownerId,
    requestWithSession,
    enabled = true,
}: PortraitQueryOptions) {
    return useQuery({
        queryKey: portraitInterviewStatusQueryKey(ownerId),
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                portraitApi.readInterviewStatus(token, signal),
            ),
        enabled: enabled && ownerId !== null,
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });
}
