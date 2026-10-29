'use client';
import { useEffect, useRef, useState } from 'react';
import type { SpeechResponse } from '@languon/contracts';
import { speechApi } from '@/fsd/features/speech-playback';
import { useSessionStore } from '@/fsd/entities/session';
import type { KnowledgeNarrationProps } from '../types';
import { applyNarration } from '../api/apply-narration';

function delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const stop = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', stop);
            resolve();
        }, ms);
        signal.addEventListener('abort', stop, { once: true });
    });
}
export function useKnowledgeNarration(props: KnowledgeNarrationProps) {
    const [selected, updateSelected] = useState('');
    const [preparedNoteId, setPreparedNoteId] = useState(props.noteId);
    const [response, setResponse] = useState<SpeechResponse | null>(null);
    const [busy, setBusy] = useState(false),
        [failed, setFailed] = useState(false),
        [applied, setApplied] = useState(false),
        [url, setUrl] = useState<string | null>(null);
    const controller = useRef<AbortController | null>(null),
        preview = useRef<string | null>(null),
        confirmation = useRef<string | null>(null);
    useEffect(
        () => () => {
            controller.current?.abort();
            if (preview.current) URL.revokeObjectURL(preview.current);
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
                controller.current?.abort();
                if (preview.current) {
                    URL.revokeObjectURL(preview.current);
                    preview.current = null;
                }
                setResponse(null);
                setUrl(null);
                setBusy(false);
                setApplied(false);
                setFailed(false);
            }),
        [],
    );
    async function consume(result: SpeechResponse, signal: AbortSignal) {
        signal.throwIfAborted();
        const api = speechApi(props.requestWithSession),
            deadline = Date.now() + 600000;
        setResponse(result);
        while (
            ['queued', 'processing'].includes(result.state) &&
            result.requestId
        ) {
            if (Date.now() > deadline)
                throw new Error('Audio preview deadline reached.');
            await delay(
                Math.min(Math.max(result.retryAfterMs ?? 1000, 250), 5000),
                signal,
            );
            result = await api.status(result.requestId, signal);
            signal.throwIfAborted();
            setResponse(result);
        }
        if (result.state === 'ready' && result.playbackId) {
            const blob = await api.bytes(result.playbackId, signal);
            signal.throwIfAborted();
            if (preview.current) URL.revokeObjectURL(preview.current);
            const next = URL.createObjectURL(blob);
            preview.current = next;
            setUrl(next);
        }
    }
    async function generate() {
        controller.current?.abort();
        const operation = new AbortController();
        controller.current = operation;
        setPreparedNoteId(props.noteId);
        setBusy(true);
        setFailed(false);
        setApplied(false);
        setResponse(null);
        setUrl(null);
        if (preview.current) {
            URL.revokeObjectURL(preview.current);
            preview.current = null;
        }
        try {
            const draft = await props.flush();
            operation.signal.throwIfAborted();
            const block =
                draft.blocks.find((item) => item.id === selected) ||
                draft.blocks.find((item) =>
                    ['bilingual-text', 'grammar', 'vocabulary'].includes(
                        item.type,
                    ),
                );
            if (!block) throw new Error('Select a source block.');
            const result = await speechApi(props.requestWithSession).prepare(
                {
                    kind: 'knowledge-block',
                    noteId: props.noteId,
                    branchId: draft.branchId,
                    blockId: block.id,
                    expectedBranchVersion: draft.branchVersion,
                },
                operation.signal,
            );
            confirmation.current = crypto.randomUUID();
            await consume(result, operation.signal);
        } catch {
            if (!operation.signal.aborted) setFailed(true);
        } finally {
            if (!operation.signal.aborted) setBusy(false);
        }
    }
    async function confirm() {
        const quote = response?.quote,
            operation = controller.current;
        if (!quote || !operation) return;
        setBusy(true);
        setFailed(false);
        try {
            await consume(
                await speechApi(props.requestWithSession).confirm(
                    quote.id,
                    confirmation.current ?? crypto.randomUUID(),
                    operation.signal,
                ),
                operation.signal,
            );
        } catch {
            if (!operation.signal.aborted) {
                setFailed(true);
                setResponse(null);
            }
        } finally {
            if (!operation.signal.aborted) setBusy(false);
        }
    }
    function cancelQuote() {
        controller.current?.abort();
        setResponse(null);
        setBusy(false);
    }
    async function apply() {
        const playbackId = response?.playbackId,
            operation = controller.current;
        if (!playbackId || !operation || preparedNoteId !== props.noteId)
            return;
        setBusy(true);
        setFailed(false);
        try {
            const result = await applyNarration(
                props.requestWithSession,
                props.noteId,
                playbackId,
                operation.signal,
            );
            operation.signal.throwIfAborted();
            await props.onApply({
                id: crypto.randomUUID(),
                type: 'audio',
                assetId: result.asset.id,
                sourceText: result.sourceText,
                transcript: {
                    language: result.language,
                    segments: [
                        { id: crypto.randomUUID(), text: result.sourceText },
                    ],
                },
            });
            setApplied(true);
        } catch {
            if (!operation.signal.aborted) setFailed(true);
        } finally {
            if (!operation.signal.aborted) setBusy(false);
        }
    }
    function setSelected(value: string) {
        controller.current?.abort();
        if (preview.current) {
            URL.revokeObjectURL(preview.current);
            preview.current = null;
        }
        updateSelected(value);
        setResponse(null);
        setUrl(null);
        setBusy(false);
        setApplied(false);
        setFailed(false);
    }
    const sameNote = preparedNoteId === props.noteId;
    return {
        selected,
        setSelected,
        response: sameNote ? response : null,
        busy: sameNote && busy,
        failed,
        applied,
        url: sameNote ? url : null,
        generate,
        confirm,
        cancelQuote,
        apply,
    };
}
