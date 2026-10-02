import type { Rating } from '../types';
import type { AckedRating, SessionState } from '../model/session-state';

export function acknowledgeRating(
    state: SessionState,
    rating: Rating,
    attemptId: string | null,
): Partial<SessionState> {
    const entryId = state.queue[state.index]!;
    const index = state.index + 1;
    const done = index >= state.queue.length;
    const snapshot = {
        index: state.index,
        face: state.face,
        roundStats: state.roundStats,
        outcomes: state.outcomes,
        reviewEvents: state.reviewEvents,
        roundsCompleted: state.roundsCompleted,
    };
    return {
        index,
        face: 'front',
        phase: done ? 'results' : 'card',
        pending: null,
        roundStats: {
            reviewed: state.roundStats.reviewed + 1,
            known: state.roundStats.known + Number(rating === 'known'),
            again: state.roundStats.again + Number(rating === 'again'),
        },
        outcomes: { ...state.outcomes, [entryId]: rating },
        reviewEvents: state.reviewEvents + 1,
        savedCount: state.savedCount + Number(attemptId !== null),
        lastAck: { attemptId, entryId, rating, snapshot },
        roundsCompleted: state.roundsCompleted + Number(done),
        announcement: done ? 'roundComplete' : 'ratingConfirmed',
    };
}

export function restoreRating(
    state: SessionState,
    acknowledged: AckedRating,
): Partial<SessionState> {
    return {
        ...acknowledged.snapshot,
        savedCount: state.savedCount - Number(acknowledged.attemptId !== null),
        lastAck: null,
        pending: null,
        conflict: null,
        phase: 'card',
        announcement: 'ratingUndone',
    };
}

export function removeEntries(
    state: SessionState,
    entryIds: string[],
): Partial<SessionState> {
    const removed = new Set(entryIds);
    const before = state.queue
        .slice(0, state.index)
        .filter((id) => removed.has(id)).length;
    const queue = state.queue.filter((id) => !removed.has(id));
    const index = Math.max(0, state.index - before);
    const done = index >= queue.length;
    const items = { ...state.items };
    const outcomes = { ...state.outcomes };
    for (const id of removed) {
        delete items[id];
        delete outcomes[id];
    }
    return {
        queue,
        index,
        items,
        outcomes,
        allIds: state.allIds.filter((id) => !removed.has(id)),
        face: 'front',
        pending: null,
        conflict: null,
        lastAck:
            state.lastAck && removed.has(state.lastAck.entryId)
                ? null
                : state.lastAck,
        notices: [...state.notices, 'entriesSkipped'],
        phase: done ? 'results' : 'loading',
        roundsCompleted:
            state.roundsCompleted + Number(done && state.phase !== 'results'),
        announcement: 'entriesSkipped',
    };
}
