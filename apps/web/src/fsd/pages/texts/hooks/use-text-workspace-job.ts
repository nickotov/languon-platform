import {
    ActionConsentCancelledError,
    useActionConsent,
} from '@/fsd/entities/ai-action';
import type {
    TextAiJob,
    EnqueueTextTranslationRequest,
} from '@languon/contracts';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';

export function useTextWorkspaceJob(
    request: RequestWithTextSession,
    actorId?: string,
    cleanupRequest = request,
) {
    const actionConsent = useActionConsent();
    const [job, setJob] = useState<TextAiJob | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [pending, setPending] = useState(false);
    const generation = useRef(0);
    const latestJob = useRef(job);
    latestJob.current = job;
    const cleanup = useRef(cleanupRequest);
    cleanup.current = cleanupRequest;
    const starting = useRef(false);

    const retryOperation = useRef<{
        fingerprint: string;
        operationId: string;
    } | null>(null);
    const active = job?.state === 'queued' || job?.state === 'running';
    const poll = useQuery({
        queryKey: ['texts-workspace-job', actorId, job?.id],
        queryFn: ({ signal }) =>
            request((token) => textsApi.getAiJob(token, job!.id, signal)),
        enabled: Boolean(job && active),
        refetchInterval: active ? 1000 : false,
        retry: 2,
    });

    useEffect(() => {
        if (active && poll.data?.job.id === job?.id) setJob(poll.data!.job);
    }, [poll.data, job?.id, active]);

    useEffect(
        () => () => {
            generation.current += 1;
            const current = latestJob.current;
            if (
                current &&
                (current.state === 'queued' || current.state === 'running')
            )
                void cleanup
                    .current((token) => textsApi.cancelAiJob(token, current.id))
                    .catch(() => undefined);
        },
        [],
    );

    async function start(
        body:
            | EnqueueTextTranslationRequest
            | {
                  folderId: string | null;
                  sourceText: string;
                  operationId: string;
              },
        detect = false,
    ) {
        if (starting.current || active) return;
        starting.current = true;
        const fingerprint = JSON.stringify({ ...body, operationId: undefined });
        const operationId =
            retryOperation.current?.fingerprint === fingerprint
                ? retryOperation.current.operationId
                : body.operationId;
        retryOperation.current = { fingerprint, operationId };
        const submission = { ...body, operationId };
        const fence = ++generation.current;
        setPending(true);
        setError(null);
        setJob(null);
        try {
            const response = await actionConsent.run((confirmedQuoteId) =>
                request((token) =>
                    detect
                        ? textsApi.detectLanguage(token, {
                              ...submission,
                              ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
                          })
                        : textsApi.translateText(token, {
                              ...submission,
                              ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
                          } as EnqueueTextTranslationRequest),
                ),
            );
            if (generation.current === fence) {
                retryOperation.current = null;
                setJob(response.job);
            } else if (
                response.job.state === 'queued' ||
                response.job.state === 'running'
            )
                await cleanup.current((token) =>
                    textsApi.cancelAiJob(token, response.job.id),
                );
        } catch (cause) {
            if (generation.current === fence)
                setError(
                    cause instanceof ActionConsentCancelledError ? null : cause,
                );
        } finally {
            if (generation.current === fence) {
                starting.current = false;
                setPending(false);
            }
        }
    }

    async function cancel() {
        const current = job;
        const fence = ++generation.current;
        retryOperation.current = null;
        starting.current = false;
        setPending(false);
        if (!current) return;
        try {
            const response = await request((token) =>
                textsApi.cancelAiJob(token, current.id),
            );
            if (generation.current === fence) setJob(response.job);
        } catch (cause) {
            if (generation.current === fence)
                setError(
                    cause instanceof ActionConsentCancelledError ? null : cause,
                );
            throw cause;
        }
    }

    function restore(next: TextAiJob) {
        if (
            starting.current ||
            (job && job.state !== 'cancelled' && job.state !== 'failed')
        )
            return false;
        setJob(next);
        setError(null);
        return true;
    }
    function clear() {
        actionConsent.cancel();
        generation.current += 1;
        starting.current = false;
        setPending(false);
        setJob(null);
        setError(null);
    }

    return {
        actionConsent,
        job,
        error: error ?? poll.error,
        pending,
        active: active || pending,
        start,
        restore,
        cancel,
        clear,
    };
}
