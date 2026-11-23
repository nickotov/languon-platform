import type { GenerationRunSummary } from '@languon/contracts';

export type LessonRunsSnapshot = {
    runs: GenerationRunSummary[];
    publication?: 'snapshot' | 'stream';
};

function compareRunVersion(
    left: GenerationRunSummary,
    right: GenerationRunSummary,
): number {
    return (
        left.revision - right.revision ||
        Date.parse(left.updatedAt) - Date.parse(right.updatedAt)
    );
}

/** A late GET cannot erase an event-created run or regress a newer streamed state. */
export function mergeLessonRunSnapshot(
    snapshot: LessonRunsSnapshot,
    current: LessonRunsSnapshot | undefined,
): LessonRunsSnapshot {
    const runs = new Map(snapshot.runs.map((run) => [run.id, run]));
    for (const run of current?.runs ?? []) {
        const incoming = runs.get(run.id);
        if (!incoming || compareRunVersion(run, incoming) >= 0) {
            runs.set(run.id, run);
        }
    }

    return { runs: [...runs.values()], publication: 'snapshot' };
}

/** Ordered canonical events win equal timestamps; older replay events cannot regress a GET. */
export function applyLessonRunEvent(
    current: LessonRunsSnapshot | undefined,
    run: GenerationRunSummary,
): LessonRunsSnapshot {
    const prior = current?.runs.find((item) => item.id === run.id);
    if (prior && compareRunVersion(prior, run) > 0) {
        return current!;
    }

    const runs = current?.runs ?? [];

    return {
        runs: prior
            ? runs.map((item) => (item.id === run.id ? run : item))
            : [...runs, run],
        publication: 'stream',
    };
}

/** TanStack invokes this at publication time, after any event racing a resolved GET. */
export function shareLessonRunCache(
    current: unknown,
    incoming: unknown,
): unknown {
    const next = incoming as LessonRunsSnapshot;

    return next.publication === 'snapshot'
        ? mergeLessonRunSnapshot(
              next,
              current as LessonRunsSnapshot | undefined,
          )
        : next;
}
