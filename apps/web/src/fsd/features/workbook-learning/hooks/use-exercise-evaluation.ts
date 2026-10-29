'use client';

import { useEffect, useRef, useState } from 'react';
import { RequestKnowledgeExerciseEvaluationSchema } from '@languon/contracts';
import type {
    SubmitWorkbookAttemptRequest,
    WorkbookLearningShareAccess,
    WorkbookLearnerAttempt,
} from '@languon/contracts';
import {
    ActionConsentCancelledError,
    useActionConsent,
} from '@/fsd/entities/ai-action';
import { learningApi } from '../api/learning-api';
import type { WorkbookLearningOptions } from './use-workbook-learning';

type EvaluationState = {
    pending: boolean;
    attempt?: WorkbookLearnerAttempt;
    failed?: boolean;
};
type Operation = {
    controller: AbortController;
    operationId: string;
    jobId?: string;
};

function pause(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        function abort() {
            clearTimeout(timer);
            reject(signal.reason);
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
        }, 750);
        signal.addEventListener('abort', abort, { once: true });
    });
}

/** Saves the private attempt first, then evaluates that exact revision and answer. */
export function useExerciseEvaluation({
    noteId,
    locale,
    requestWithSession,
    access,
    onCompleted,
}: {
    noteId: string;
    locale: string;
    requestWithSession: WorkbookLearningOptions['requestWithSession'];
    access: WorkbookLearningShareAccess | undefined;
    onCompleted(): Promise<unknown>;
}) {
    const [states, setStates] = useState<Record<string, EvaluationState>>({});
    const active = useRef(new Map<string, Operation>());
    const mounted = useRef(true);
    const consent = useActionConsent();
    const accessKind = access?.kind;
    const accessLocator = access?.locator;
    const accessKey = access?.key;
    useEffect(() => {
        mounted.current = true;
        const operations = active.current;
        return () => {
            mounted.current = false;
            for (const operation of operations.values()) {
                operation.controller.abort();
                if (operation.jobId)
                    void requestWithSession((token) =>
                        learningApi.cancelEvaluation(
                            token,
                            noteId,
                            operation.jobId!,
                            access,
                        ),
                    ).catch(() => undefined);
            }
            operations.clear();
        };
    }, [noteId, requestWithSession, accessKind, accessLocator, accessKey]);

    async function run(input: SubmitWorkbookAttemptRequest) {
        if (active.current.has(input.exerciseId)) return;
        const operation: Operation = {
            controller: new AbortController(),
            operationId: crypto.randomUUID(),
        };
        active.current.set(input.exerciseId, operation);
        setStates((current) => ({
            ...current,
            [input.exerciseId]: { pending: true },
        }));
        try {
            const { attempt } = await requestWithSession((token) =>
                learningApi.attempt(token, noteId, input, access),
            );
            operation.controller.signal.throwIfAborted();
            const request = RequestKnowledgeExerciseEvaluationSchema.parse({
                operationId: operation.operationId,
                attemptId: attempt.id,
                replyLanguage: locale,
            });
            let { job } = await consent.run((confirmedQuoteId) =>
                requestWithSession((token) =>
                    learningApi.evaluate(
                        token,
                        noteId,
                        request,
                        access,
                        confirmedQuoteId,
                    ),
                ),
            );
            operation.jobId = job.id;
            if (operation.controller.signal.aborted) {
                void requestWithSession((token) =>
                    learningApi.cancelEvaluation(
                        token,
                        noteId,
                        operation.jobId!,
                        access,
                    ),
                ).catch(() => undefined);
                return;
            }
            const deadline = Date.now() + 120_000;
            while (job.status === 'queued' || job.status === 'running') {
                if (Date.now() >= deadline)
                    throw new Error('Evaluation deadline reached.');
                await pause(operation.controller.signal);
                ({ job } = await requestWithSession((token) =>
                    learningApi.evaluation(
                        token,
                        noteId,
                        operation.jobId!,
                        access,
                        operation.controller.signal,
                    ),
                ));
            }
            operation.controller.signal.throwIfAborted();
            if (job.status !== 'completed' || !job.attempt)
                throw new Error('Evaluation unavailable.');
            if (mounted.current) {
                setStates((current) => ({
                    ...current,
                    [input.exerciseId]: {
                        pending: false,
                        attempt: job.attempt!,
                    },
                }));
                await onCompleted();
            }
        } catch (error) {
            if (mounted.current && !operation.controller.signal.aborted) {
                setStates((current) => ({
                    ...current,
                    [input.exerciseId]: {
                        pending: false,
                        failed: !(error instanceof ActionConsentCancelledError),
                    },
                }));
            }
            if (operation.jobId)
                void requestWithSession((token) =>
                    learningApi.cancelEvaluation(
                        token,
                        noteId,
                        operation.jobId!,
                        access,
                    ),
                ).catch(() => undefined);
        } finally {
            if (active.current.get(input.exerciseId) === operation)
                active.current.delete(input.exerciseId);
        }
    }
    return { states, run, consent };
}
