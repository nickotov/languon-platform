'use client';
import { eligiblePrivateTranslationTargets } from '../lib/eligible-targets';
import type { RequestKnowledgeTranslation } from '@languon/contracts';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActionConsent } from '@/fsd/entities/ai-action';
import type { KnowledgePrivateTranslationProps } from '../types';
import {
    privateTranslationApi,
    PrivateTranslationApiError,
} from '../api/private-translation-api';

function wait(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const done = () => {
            signal.removeEventListener('abort', abort);
            resolve();
        };
        const timer = setTimeout(done, 700);
        const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(signal.reason);
        };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
    });
}
export function usePrivateTranslation(props: KnowledgePrivateTranslationProps) {
    const consent = useActionConsent();
    const api = privateTranslationApi(props);
    const targets = eligiblePrivateTranslationTargets(props.block);
    const [language, setLanguage] = useState<
        RequestKnowledgeTranslation['targetLanguage'] | null
    >(targets[0] ?? null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const control = useRef<AbortController | null>(null);
    const operation = useRef<{
        id: string;
        language: RequestKnowledgeTranslation['targetLanguage'];
    } | null>(null);
    const query = useQuery({
        queryKey: [
            'knowledge-private-translations',
            props.actorId,
            props.noteId,
            props.block.id,
            props.noteVersion,
            props.access?.locator,
        ],
        queryFn: ({ signal }) => api.list(signal),
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: true,
    });
    useEffect(() => () => control.current?.abort(), []);
    async function generate() {
        if (busy || !language) return;
        const current =
            operation.current?.language === language
                ? operation.current
                : { id: crypto.randomUUID(), language };
        operation.current = current;
        const request = new AbortController();
        control.current = request;
        setBusy(true);
        setFailed(false);
        setUnavailable(false);
        try {
            let response = await consent.run((confirmedQuoteId) =>
                api.request(
                    {
                        operationId: current.id,
                        targetLanguage: current.language,
                        ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
                    },
                    request.signal,
                ),
            );
            if (request.signal.aborted) return;
            setJobId(response.job.id);
            const until = Date.now() + 120_000;
            while (
                response.job.state === 'queued' ||
                response.job.state === 'running'
            ) {
                if (Date.now() >= until) throw new Error('Polling deadline');
                await wait(request.signal);
                response = await api.job(response.job.id, request.signal);
                if (request.signal.aborted) return;
            }
            operation.current = null;
            if (response.job.state === 'completed') await query.refetch();
            else if (response.job.state !== 'cancelled') setFailed(true);
        } catch (error) {
            if (request.signal.aborted) return;
            const lost =
                error instanceof PrivateTranslationApiError &&
                [401, 403, 404, 409].includes(error.status);
            if (lost) setUnavailable(true);
            setFailed(true);
        } finally {
            if (!request.signal.aborted) {
                setBusy(false);
                setJobId(null);
            }
        }
    }
    async function cancel() {
        if (!jobId) {
            if (consent.quote) consent.cancel();
            return;
        }
        try {
            await api.cancel(jobId, AbortSignal.timeout(15_000));
            control.current?.abort();
            setBusy(false);
            setJobId(null);
            operation.current = null;
        } catch {
            setFailed(true);
        }
    }
    return {
        consent,
        language,
        targets,
        setLanguage,
        busy,
        canCancel: jobId !== null,
        failed,
        unavailable: unavailable || query.isError,
        loading: query.isPending,
        translations:
            unavailable || query.isError
                ? []
                : (query.data?.translations ?? []),
        generate,
        cancel,
        retry: query.refetch,
    };
}
