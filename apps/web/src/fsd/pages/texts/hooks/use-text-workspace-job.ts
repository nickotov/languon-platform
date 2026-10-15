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
) {
    const [job, setJob] = useState<TextAiJob | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [pending, setPending] = useState(false);
    const generation = useRef(0);
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
        },
        [],
    );
    async function start(
        body:
            | EnqueueTextTranslationRequest
            | { folderId: string; sourceText: string; operationId: string },
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
            const response = await request((token) =>
                detect
                    ? textsApi.detectLanguage(token, submission)
                    : textsApi.translateText(
                          token,
                          submission as EnqueueTextTranslationRequest,
                      ),
            );
            retryOperation.current = null;
            if (generation.current === fence) setJob(response.job);
            else
                await request((token) =>
                    textsApi.cancelAiJob(token, response.job.id),
                );
        } catch (cause) {
            if (generation.current === fence) setError(cause);
        } finally {
            starting.current = false;
            if (generation.current === fence) setPending(false);
        }
    }
    async function cancel() {
        const current = job;
        generation.current += 1;
        setPending(false);
        if (!current) return;
        try {
            const response = await request((token) =>
                textsApi.cancelAiJob(token, current.id),
            );
            setJob(response.job);
        } catch (cause) {
            setError(cause);
            throw cause;
        }
    }
    function clear() {
        generation.current += 1;
        setJob(null);
        setError(null);
    }
    return {
        job,
        error: error ?? poll.error,
        pending,
        active: active || pending,
        start,
        cancel,
        clear,
    };
}
