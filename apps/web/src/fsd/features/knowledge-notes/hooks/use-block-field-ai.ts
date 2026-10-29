'use client';

import { useEffect, useRef, useState } from 'react';
import type {
    KnowledgeBlockFieldResult,
    KnowledgeBlockFieldTarget,
} from '@languon/contracts';
import {
    ActionConsentCancelledError,
    useActionConsent,
} from '@/fsd/entities/ai-action';
import {
    blockFieldAiApi,
    BlockFieldAiError,
    type KnowledgeBlockFieldAiContext,
} from '../api/block-field-ai-api';

export type BlockFieldAiState = {
    target: KnowledgeBlockFieldTarget;
    scope: string;
    status: 'pending' | 'completed' | 'failed';
    result?: KnowledgeBlockFieldResult;
    error?: string;
};
type Active = { controller: AbortController; jobId?: string };
type RetryIdentity = {
    fingerprint: string;
    operationId: string;
    jobId?: string;
};

/** One validated proposal per explicit field; no content write is performed by this hook. */
export function useBlockFieldAi(
    context: KnowledgeBlockFieldAiContext | undefined,
    blockId: string,
) {
    const [states, setStates] = useState<Record<string, BlockFieldAiState>>({});
    const active = useRef(new Map<string, Active>());
    const retries = useRef(new Map<string, RetryIdentity>());
    const mounted = useRef(true);
    const consent = useActionConsent();
    const scope = `${context?.noteId ?? ''}:${context?.branchId ?? ''}`;
    useEffect(() => {
        mounted.current = true;
        const requests = active.current;
        const retryJobs = retries.current;
        return () => {
            mounted.current = false;
            const jobs = new Set<string>();
            for (const request of requests.values()) {
                request.controller.abort();
                if (request.jobId) jobs.add(request.jobId);
            }
            for (const retry of retryJobs.values())
                if (retry.jobId) jobs.add(retry.jobId);
            if (context)
                for (const jobId of jobs)
                    void blockFieldAiApi
                        .cancel(context, jobId)
                        .catch(() => undefined);
            retryJobs.clear();
            requests.clear();
        };
    }, [context?.noteId, context?.branchId, context?.requestWithSession]);

    async function run(key: string, field: KnowledgeBlockFieldTarget) {
        if (!context || active.current.has(key)) return;
        const fingerprint = JSON.stringify([scope, blockId, field]);
        const previousRetry = retries.current.get(key);
        const retry =
            previousRetry?.fingerprint === fingerprint
                ? previousRetry
                : { fingerprint, operationId: crypto.randomUUID() };
        retries.current.set(key, retry);
        const input = {
            operationId: retry.operationId,
            branchId: context.branchId,
            blockId,
            action: field.currentValue.trim()
                ? ('check' as const)
                : ('generate' as const),
            field,
        };
        const request: Active = { controller: new AbortController() };
        active.current.set(key, request);
        setStates((previous) => ({
            ...previous,
            [key]: { target: field, scope, status: 'pending' },
        }));
        try {
            let { job } = retry.jobId
                ? await blockFieldAiApi.get(
                      context,
                      retry.jobId,
                      request.controller.signal,
                  )
                : await consent.run((confirmedQuoteId) =>
                      blockFieldAiApi.submit(context, input, confirmedQuoteId),
                  );
            retry.jobId = job.id;
            request.jobId = job.id;
            if (!mounted.current || request.controller.signal.aborted) {
                void blockFieldAiApi
                    .cancel(context, job.id)
                    .catch(() => undefined);
                return;
            }
            const deadline = Date.now() + 120_000;
            while (job.status === 'queued' || job.status === 'running') {
                if (Date.now() >= deadline) throw new Error('deadline');
                await new Promise<void>((resolve, reject) => {
                    const signal = request.controller.signal;
                    if (signal.aborted) {
                        reject(new DOMException('Cancelled', 'AbortError'));
                        return;
                    }
                    function abort() {
                        clearTimeout(timer);
                        reject(new DOMException('Cancelled', 'AbortError'));
                    }
                    const timer = setTimeout(() => {
                        signal.removeEventListener('abort', abort);
                        resolve();
                    }, 750);
                    signal.addEventListener('abort', abort, { once: true });
                });
                ({ job } = await blockFieldAiApi.get(
                    context,
                    job.id,
                    request.controller.signal,
                ));
            }
            if (!mounted.current || request.controller.signal.aborted) return;
            if (retries.current.get(key) === retry) retries.current.delete(key);
            if (job.status !== 'completed' || !job.result)
                throw new Error('unavailable');
            setStates((previous) => ({
                ...previous,
                [key]: {
                    target: field,
                    scope,
                    status: 'completed',
                    result: job.result!,
                },
            }));
        } catch (error) {
            if (!mounted.current || request.controller.signal.aborted) return;
            if (error instanceof ActionConsentCancelledError) {
                clear(key);
                return;
            }
            let message = 'AI checking failed. Your edits are kept.';
            if (
                error instanceof BlockFieldAiError &&
                ['credits_exhausted', 'ai_credits_exhausted'].includes(
                    error.detail.code,
                )
            )
                message = 'Not enough credits. Your edits are kept.';
            setStates((previous) => ({
                ...previous,
                [key]: {
                    target: field,
                    scope,
                    status: 'failed',
                    error: message,
                },
            }));
            if (
                request.jobId &&
                error instanceof Error &&
                error.message === 'deadline'
            ) {
                void blockFieldAiApi
                    .cancel(context, request.jobId)
                    .then(({ job }) => {
                        if (
                            job.status === 'cancelled' &&
                            retries.current.get(key) === retry
                        )
                            retries.current.delete(key);
                    })
                    .catch(() => undefined);
            }
        } finally {
            if (active.current.get(key) === request) active.current.delete(key);
        }
    }
    function clear(key: string) {
        retries.current.delete(key);
        setStates((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
        });
    }
    const visibleStates = Object.fromEntries(
        Object.entries(states).filter(([, value]) => value.scope === scope),
    );
    return {
        states: visibleStates,
        run,
        clear,
        consent,
        available: Boolean(context),
    };
}
export type BlockFieldAi = ReturnType<typeof useBlockFieldAi>;
