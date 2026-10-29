'use client';
import { useEffect, useRef, useState } from 'react';
import { type KnowledgeTranscriptionJob } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import {
    transcriptionApi,
    TranscriptionApiError,
} from '../api/transcription-api';
import {
    pollTranscription,
    transcriptionTerminal,
} from '../lib/poll-transcription';
import type { KnowledgeTranscriptionProps } from '../types';

import {
    captureTranscription,
    transcriptionReplacement,
    type PreparedTranscription,
} from '../lib/transcription-proposal';

type Action = 'submit' | 'read' | 'cancel';
async function cancelPrepared(
    api: ReturnType<typeof transcriptionApi>,
    current: PreparedTranscription,
) {
    const bounded = new AbortController();
    const timeout = setTimeout(() => bounded.abort(), 30_000);
    try {
        return await api.cancel(
            current.noteId,
            current.input.operationId,
            bounded.signal,
        );
    } catch {
        // Best effort; a still-admitting POST is cancelled again after its response.
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
export function useKnowledgeTranscription(props: KnowledgeTranscriptionProps) {
    const [selected, setSelectedValue] = useState(''),
        [language, setLanguage] = useState(props.language);
    const [job, setJob] = useState<KnowledgeTranscriptionJob | null>(null),
        [busy, setBusy] = useState(false),
        [failed, setFailed] = useState(false),
        [unready, setUnready] = useState(false),
        [applied, setApplied] = useState(false),
        [conflict, setConflict] = useState(false);
    const prepared = useRef<PreparedTranscription | null>(null),
        controller = useRef<AbortController | null>(null),
        lastAction = useRef<Action>('submit'),
        lock = useRef(false),
        cancelling = useRef(false);
    const [jobNoteId, setJobNoteId] = useState(props.noteId);
    const latest = useRef(props);
    latest.current = props;
    const observedJob = useRef<KnowledgeTranscriptionJob | null>(null);
    const submission = useRef<{
        operation: AbortController;
        detached: 'closed' | 'cancel' | null;
    } | null>(null);
    function reset() {
        controller.current?.abort();
        prepared.current = null;
        observedJob.current = null;
        lock.current = false;
        cancelling.current = false;
        setJob(null);
        setBusy(false);
        setFailed(false);
        setUnready(false);
        setApplied(false);
        setConflict(false);
    }
    useEffect(
        () => () => {
            const admitting = submission.current;
            if (
                latest.current.cancelOnUnmount &&
                admitting?.operation === controller.current
            ) {
                // Retain only bounded admission readback, never polling or UI after closure.
                admitting.detached = 'closed';
            } else controller.current?.abort();
            const current = prepared.current;
            if (
                latest.current.cancelOnUnmount &&
                current &&
                !transcriptionTerminal(observedJob.current)
            ) {
                // Dialog closure must not leave a known learner-funded request running.
                void cancelPrepared(
                    transcriptionApi(
                        latest.current.requestWithSession,
                        current.expected.assetId,
                    ),
                    current,
                );
            }
            prepared.current = null;
        },
        [props.noteId],
    );
    useEffect(
        () =>
            useSessionStore.subscribe((next, previous) => {
                if (
                    next.status === 'authenticated' &&
                    next.user?.id === previous.user?.id
                )
                    return;
                reset();
            }),
        [],
    );
    async function perform(action: Action) {
        const current = prepared.current;
        if (!current) return;
        const pendingAdmission = submission.current;
        if (
            action === 'cancel' &&
            props.cancelOnUnmount &&
            pendingAdmission?.operation === controller.current
        ) {
            // An early cancellation may precede POST commit. Keep its bounded readback
            // so the admitted job is cancelled again without starting observation.
            pendingAdmission.detached = 'cancel';
        } else controller.current?.abort();
        const operation = new AbortController();
        controller.current = operation;
        lastAction.current = action;
        lock.current = true;
        setBusy(true);
        setFailed(false);
        setUnready(false);
        const api = transcriptionApi(
            props.requestWithSession,
            current.expected.assetId,
        );
        const admitting =
            props.cancelOnUnmount && action === 'submit'
                ? { operation, detached: null as 'closed' | 'cancel' | null }
                : null;
        if (admitting) submission.current = admitting;
        function recoverCancelledDialog(
            result: KnowledgeTranscriptionJob | null,
        ) {
            if (
                admitting?.detached !== 'cancel' ||
                prepared.current !== current
            )
                return;
            // Only this still-open request can recover its controls; closure/reset
            // erases the prepared identity and prevents every late UI update.
            controller.current?.abort();
            lock.current = false;
            cancelling.current = false;
            setBusy(false);
            if (result && transcriptionTerminal(result)) {
                if (result.state === 'cancelled') {
                    observedJob.current = result;
                    setJob(result);
                    setFailed(false);
                    setUnready(false);
                } else reset();
            } else {
                setFailed(true);
                setUnready(false);
            }
        }
        try {
            let result;
            if (action === 'submit') {
                const timeout = admitting
                    ? setTimeout(() => operation.abort(), 30_000)
                    : null;
                try {
                    result = await api.submit(current.input, operation.signal);
                } finally {
                    if (timeout !== null) clearTimeout(timeout);
                    if (submission.current === admitting)
                        submission.current = null;
                }
            } else if (action === 'cancel')
                result = await api.cancel(
                    current.noteId,
                    current.input.operationId,
                    operation.signal,
                );
            else
                result = await api.read(
                    current.noteId,
                    current.input.operationId,
                    operation.signal,
                );
            if (admitting?.detached) {
                const cancelled = transcriptionTerminal(result)
                    ? result
                    : await cancelPrepared(api, current);
                recoverCancelledDialog(cancelled);
                return;
            }
            operation.signal.throwIfAborted();
            if (result.assetId !== current.expected.assetId)
                throw new Error('The audio source changed.');
            await pollTranscription(
                result,
                () =>
                    api.read(
                        current.noteId,
                        current.input.operationId,
                        operation.signal,
                    ),
                operation.signal,
                (next) => {
                    if (!operation.signal.aborted) {
                        observedJob.current = next;
                        setJob(next);
                    }
                },
            );
        } catch (error) {
            if (admitting?.detached) {
                recoverCancelledDialog(await cancelPrepared(api, current));
                return;
            }
            if (!operation.signal.aborted) {
                setFailed(true);
                setUnready(
                    error instanceof TranscriptionApiError &&
                        [400, 403, 404, 409, 503].includes(error.status),
                );
            }
        } finally {
            if (
                controller.current === operation &&
                !operation.signal.aborted &&
                !admitting?.detached
            ) {
                lock.current = false;
                cancelling.current = false;
                setBusy(false);
            }
        }
    }
    async function prepare() {
        if (lock.current || (prepared.current && !transcriptionTerminal(job)))
            return;
        reset();
        lock.current = true;
        setBusy(true);
        setJobNoteId(props.noteId);
        const preparation = new AbortController();
        controller.current = preparation;
        try {
            const targetId =
                selected ||
                props.blocks.find((block) => block.type === 'audio')?.id;
            if (!targetId) throw new Error('Select an audio block.');
            const draft = await props.flush();
            preparation.signal.throwIfAborted();
            prepared.current = captureTranscription(
                props.noteId,
                draft,
                targetId,
                props.variant === 'focused' ? props.language : language,
            );
            lock.current = false;
            await perform('submit');
        } catch {
            if (!preparation.signal.aborted) {
                lock.current = false;
                setBusy(false);
                setFailed(true);
            }
        }
    }
    async function confirm() {
        if (
            lock.current ||
            job?.state !== 'confirmation-required' ||
            !prepared.current
        )
            return;
        prepared.current.input = {
            ...prepared.current.input,
            confirmedMaximumCredits: job.maximumCredits,
        };
        await perform('submit');
    }
    async function cancel() {
        if (
            cancelling.current ||
            !prepared.current ||
            transcriptionTerminal(job)
        )
            return;
        cancelling.current = true;
        await perform('cancel');
    }
    async function retry() {
        if (lock.current || !prepared.current) return;
        await perform(
            (job?.state === 'queued' || job?.state === 'running') &&
                lastAction.current !== 'cancel'
                ? 'read'
                : lastAction.current,
        );
    }
    async function apply() {
        const current = prepared.current;
        if (
            lock.current ||
            !current ||
            job?.state !== 'completed' ||
            !job.result ||
            applied ||
            current.noteId !== props.noteId
        )
            return;
        lock.current = true;
        setBusy(true);
        setFailed(false);
        setConflict(false);
        try {
            const replacement = transcriptionReplacement(
                current.expected,
                job.result.text,
                current.input.languages[0]!,
            );
            const outcome = await props.onApply(current.expected, replacement, {
                noteId: current.noteId,
                branchId: current.branchId,
                branchVersion: current.branchVersion,
            });
            if (outcome === 'applied') setApplied(true);
            else if (outcome === 'invalid') setFailed(true);
            else setConflict(true);
        } catch {
            setFailed(true);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    function setSelected(value: string) {
        if (lock.current || (prepared.current && !transcriptionTerminal(job)))
            return;
        reset();
        setSelectedValue(value);
    }
    const sameNote = jobNoteId === props.noteId;
    const active = prepared.current !== null && !transcriptionTerminal(job);
    return {
        selected,
        setSelected,
        language,
        setLanguage,
        job: sameNote ? job : null,
        busy: sameNote && busy,
        failed: sameNote && failed,
        unready: sameNote && unready,
        applied: sameNote && applied,
        conflict: sameNote && conflict,
        active: sameNote && active,
        canRetry: prepared.current !== null,
        prepare,
        confirm,
        cancel,
        retry,
        apply,
    };
}
