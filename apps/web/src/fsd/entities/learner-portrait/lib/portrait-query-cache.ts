import type { PortraitState } from '@languon/contracts';
import type { QueryClient } from '@tanstack/react-query';

export const portraitQueryKey = (ownerId: string | null) =>
    ['learner-portrait', ownerId] as const;
export const portraitInterviewStatusQueryKey = (ownerId: string | null) =>
    ['learner-portrait-interview-status', ownerId] as const;

export function invalidatePortraitInterviewStatusCache(
    client: QueryClient,
    ownerId: string,
) {
    return client.invalidateQueries({
        queryKey: portraitInterviewStatusQueryKey(ownerId),
        exact: true,
    });
}

/** Ignore delayed mutation responses from an older server version. */
export function setPortraitStateCache(
    client: QueryClient,
    ownerId: string,
    state: PortraitState,
) {
    client.setQueryData<PortraitState>(
        portraitQueryKey(ownerId),
        (previous) => {
            if (previous && previous.version > state.version) return previous;
            return state;
        },
    );
}

export function invalidatePortraitStateCache(
    client: QueryClient,
    ownerId: string,
) {
    return client.invalidateQueries({
        queryKey: portraitQueryKey(ownerId),
        exact: true,
    });
}
