import type {
    DictionaryCardAuthoringGenerationJob,
    DictionaryCardAuthoringProposal,
} from '@languon/contracts';

export interface CardAuthoringCleanupPlan {
    cancelJobIds: string[];
    discardJobIds: string[];
}

export function resolveCardAuthoringCleanupRead(
    job: DictionaryCardAuthoringGenerationJob,
): 'complete' | 'discard' | 'retry' {
    if (job.state === 'review') return 'discard';
    if (
        ['accepted', 'cancelled', 'discarded', 'expired', 'failed'].includes(
            job.state,
        )
    )
        return 'complete';
    return 'retry';
}

export function planCardAuthoringCleanup(
    currentJob: DictionaryCardAuthoringGenerationJob | null | undefined,
    latestReviewJob: DictionaryCardAuthoringGenerationJob | null | undefined,
    currentJobId?: string | null,
): CardAuthoringCleanupPlan {
    const cancelJobIds =
        currentJob?.state === 'queued' || currentJob?.state === 'running'
            ? [currentJob.id]
            : !currentJob && currentJobId
              ? [currentJobId]
              : [];
    const discardJobIds = [
        ...new Set(
            [currentJob, latestReviewJob]
                .filter((job) => job?.state === 'review')
                .map((job) => job!.id),
        ),
    ];
    return { cancelJobIds, discardJobIds };
}

export function discardedSuggestionIdsForPredecessor(
    hiddenSuggestionIds: ReadonlySet<string>,
    predecessor: DictionaryCardAuthoringProposal | null | undefined,
): string[] {
    if (!predecessor) return [];
    const predecessorIds = new Set(
        predecessor.suggestions.map((suggestion) => suggestion.id),
    );
    return [...hiddenSuggestionIds].filter((id) => predecessorIds.has(id));
}
