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
    function reset() {
        controller.current?.abort();
        prepared.current = null;
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
            controller.current?.abort();
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
        controller.current?.abort();
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
        try {
            let result;
            if (action === 'submit')
                result = await api.submit(current.input, operation.signal);
            else if (action === 'cancel')
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
                    if (!operation.signal.aborted) setJob(next);
                },
            );
        } catch (error) {
            if (!operation.signal.aborted) {
                setFailed(true);
                setUnready(
                    error instanceof TranscriptionApiError &&
                        [400, 403, 404, 409, 503].includes(error.status),
                );
            }
        } finally {
            if (controller.current === operation && !operation.signal.aborted) {
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
                language,
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
                language,
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
