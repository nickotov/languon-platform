import { useSessionStore } from '@/fsd/entities/session';
import type { PortraitSessionRequest } from '@/fsd/entities/learner-portrait';

export function isInterviewOwner(ownerId: string | null): ownerId is string {
    return ownerId !== null && useSessionStore.getState().user?.id === ownerId;
}
class InterviewOwnerChangedError extends Error {}

/** Auth refresh may retry the callback: check identity at every dispatch and receipt. */
export function ownerScopedInterviewRequest(
    ownerId: string,
    request: PortraitSessionRequest,
): PortraitSessionRequest {
    return async function requestForOwner<T>(
        operation: (token: string) => Promise<T>,
    ) {
        if (!isInterviewOwner(ownerId)) throw new InterviewOwnerChangedError();
        const result = await request((token) => {
            if (!isInterviewOwner(ownerId))
                throw new InterviewOwnerChangedError();
            return operation(token);
        });
        if (!isInterviewOwner(ownerId)) throw new InterviewOwnerChangedError();
        return result;
    };
}
