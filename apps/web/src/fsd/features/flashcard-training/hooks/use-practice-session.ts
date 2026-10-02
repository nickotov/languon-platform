import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { PracticeSession } from '../model/practice-session';
import type { SessionInput } from '../model/session-state';

export type {
    SessionInput,
    SessionState,
    Pending,
    RoundStats,
    ConflictKind,
} from '../model/session-state';

export function usePracticeSession(input: SessionInput) {
    const { api, sessionId, configuration, shuffle, entryIds, signedIn } =
        input;
    // Parent supplies the immutable start payload; changing identity creates a new API/session.
    const session = useMemo(
        () =>
            new PracticeSession({
                api,
                sessionId,
                configuration,
                shuffle,
                entryIds,
                signedIn,
            }),
        [api, sessionId, configuration, shuffle, entryIds, signedIn],
    );
    const state = useSyncExternalStore(
        session.subscribe,
        session.getState,
        session.getState,
    );
    useEffect(() => {
        session.start();
        return () => session.dispose();
    }, [session]);
    useEffect(() => {
        function refreshWhenVisible() {
            if (document.visibilityState === 'visible')
                void session.refreshProgress();
        }
        window.addEventListener('focus', refreshWhenVisible);
        document.addEventListener('visibilitychange', refreshWhenVisible);
        return () => {
            window.removeEventListener('focus', refreshWhenVisible);
            document.removeEventListener(
                'visibilitychange',
                refreshWhenVisible,
            );
        };
    }, [session]);
    const currentId = state.queue[state.index];
    return {
        state,
        currentItem: currentId ? state.items[currentId] : undefined,
        flip: session.flip,
        rate: session.rate,
        undo: session.undo,
        retry: session.retry,
        resolveContentConflict: session.resolveContentConflict,
        dismissConflict: session.dismissConflict,
        practiseAgain: session.practiseAgain,
        startOver: session.startOver,
        retryLoad: session.retryLoad,
        refreshProgress: session.refreshProgress,
        dismissNotice: session.dismissNotice,
    };
}
