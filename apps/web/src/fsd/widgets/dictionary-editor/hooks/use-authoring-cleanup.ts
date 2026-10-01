import { dictionaryApi } from '@/fsd/entities/dictionary';
import {
    planCardAuthoringCleanup,
    resolveCardAuthoringCleanupRead,
} from '@/fsd/features/dictionary-card-authoring';
import { useEffect, useRef } from 'react';

import type { useAuthoringJob } from './use-authoring-job';
import type { useEditorState } from './use-editor-state';

export function useAuthoringCleanup({
    authoringJobId,
    authoringReviewJob,
    requestWithSession,
    authoringJob,
}: Pick<
    ReturnType<typeof useEditorState>,
    'authoringJobId' | 'authoringReviewJob' | 'requestWithSession'
> &
    Pick<ReturnType<typeof useAuthoringJob>, 'authoringJob'>) {
    const authoringCleanup = useRef({
        cancelJobIds: new Set<string>(),
        discardJobIds: new Set<string>(),
    });

    const authoringCleanupInFlight = useRef<Promise<void> | null>(null);

    const authoringCleanupRequested = useRef(false);
    const retainedReviewIds = useRef(new Set<string>());
    useEffect(() => {
        if (authoringReviewJob?.state === 'review')
            retainedReviewIds.current.add(authoringReviewJob.id);
        if (authoringJob.data?.state === 'review')
            retainedReviewIds.current.add(authoringJob.data.id);
    }, [authoringReviewJob, authoringJob.data]);

    function flushCardAuthoringCleanup(): Promise<void> {
        if (authoringCleanupInFlight.current) {
            authoringCleanupRequested.current = true;
            return authoringCleanupInFlight.current;
        }
        const cleanup = async () => {
            do {
                authoringCleanupRequested.current = false;
                for (const jobId of [
                    ...authoringCleanup.current.cancelJobIds,
                ]) {
                    try {
                        await requestWithSession((token) =>
                            dictionaryApi.cancelGenerationJob(token, jobId),
                        );
                        authoringCleanup.current.cancelJobIds.delete(jobId);
                    } catch {
                        try {
                            const { job } = await requestWithSession((token) =>
                                dictionaryApi.readGenerationJob(token, jobId),
                            );
                            if (job.kind !== 'card-authoring') continue;
                            const resolution =
                                resolveCardAuthoringCleanupRead(job);
                            if (resolution === 'discard') {
                                authoringCleanup.current.cancelJobIds.delete(
                                    jobId,
                                );
                                authoringCleanup.current.discardJobIds.add(
                                    jobId,
                                );
                            } else if (resolution === 'complete') {
                                authoringCleanup.current.cancelJobIds.delete(
                                    jobId,
                                );
                            }
                        } catch {
                            // Retain the ID for the next bounded retry.
                        }
                    }
                }
                for (const jobId of [
                    ...authoringCleanup.current.discardJobIds,
                ]) {
                    try {
                        const { job } = await requestWithSession((token) =>
                            dictionaryApi.readGenerationJob(token, jobId),
                        );
                        if (job.kind !== 'card-authoring') continue;
                        if (
                            resolveCardAuthoringCleanupRead(job) === 'complete'
                        ) {
                            authoringCleanup.current.discardJobIds.delete(
                                jobId,
                            );
                            continue;
                        }
                        if (job.state !== 'review') continue;
                        await requestWithSession((token) =>
                            dictionaryApi.discardGenerationJob(token, jobId),
                        );
                        authoringCleanup.current.discardJobIds.delete(jobId);
                    } catch {
                        try {
                            const { job } = await requestWithSession((token) =>
                                dictionaryApi.readGenerationJob(token, jobId),
                            );
                            if (
                                job.kind === 'card-authoring' &&
                                resolveCardAuthoringCleanupRead(job) ===
                                    'complete'
                            )
                                authoringCleanup.current.discardJobIds.delete(
                                    jobId,
                                );
                        } catch {
                            // Keep the review ID for the next bounded retry.
                        }
                    }
                }
            } while (authoringCleanupRequested.current);
        };
        const running = cleanup().finally(() => {
            authoringCleanupInFlight.current = null;
        });
        authoringCleanupInFlight.current = running;
        return running;
    }

    function queueCardAuthoringCleanup(): Promise<void> {
        const plan = planCardAuthoringCleanup(
            authoringJob.data,
            authoringReviewJob,
            authoringJobId,
        );
        plan.cancelJobIds.forEach((jobId) =>
            authoringCleanup.current.cancelJobIds.add(jobId),
        );
        plan.discardJobIds.forEach((jobId) =>
            authoringCleanup.current.discardJobIds.add(jobId),
        );
        retainedReviewIds.current.forEach((jobId) =>
            authoringCleanup.current.discardJobIds.add(jobId),
        );
        retainedReviewIds.current.clear();
        return flushCardAuthoringCleanup();
    }

    useEffect(() => {
        const retry = () => void flushCardAuthoringCleanup();
        window.addEventListener('online', retry);
        return () => window.removeEventListener('online', retry);
    }, []);

    return {
        authoringCleanup,
        authoringCleanupInFlight,
        authoringCleanupRequested,
        flushCardAuthoringCleanup,
        queueCardAuthoringCleanup,
    };
}
