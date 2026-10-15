import { useEffect, useMemo, useRef } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import type { RequestWithTextSession } from '@/fsd/entities/texts';

export function useTextWorkspaceSession(
    actorId: string,
    request: RequestWithTextSession,
) {
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    return useMemo(() => {
        function isCurrent() {
            const state = useSessionStore.getState();
            return (
                mounted.current &&
                state.status === 'authenticated' &&
                state.user?.id === actorId
            );
        }
        function assertCurrent() {
            if (!isCurrent())
                throw new DOMException(
                    'Workspace session changed',
                    'AbortError',
                );
        }
        const scopedRequest: RequestWithTextSession = async (operation) => {
            assertCurrent();
            const value = await request((token) => {
                assertCurrent();
                return operation(token);
            });
            assertCurrent();
            return value;
        };
        return { request: scopedRequest, isCurrent };
    }, [actorId, request]);
}
