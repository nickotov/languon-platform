'use client';

import { useEffect, useRef, useState } from 'react';
import {
    SpeechSourceSchema,
    type LearningBlock,
    type SpeechResponse,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { speechApi } from '@/fsd/features/speech-playback';
import { applyNarration } from '../api/apply-narration';

type AudioBlock = Extract<LearningBlock, { type: 'audio' }>;
export interface KnowledgeAudioPreparationProps {
    noteId: string;
    branchId: string;
    block: AudioBlock;
    language: string;
    requestWithSession: RequestWithSession;
    onAccept(block: AudioBlock): void;
}
type Prepared = {
    key: string;
    block: AudioBlock;
    sourceText: string;
    response: SpeechResponse;
    url: string;
};

function pause(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
        }, ms);
        function abort() {
            clearTimeout(timer);
            reject(signal.reason);
        }
        signal.addEventListener('abort', abort, { once: true });
    });
}

/** Generation never mutates author content; only explicit acceptance creates a local draft replacement. */
export function useKnowledgeAudioPreparation(
    props: KnowledgeAudioPreparationProps,
) {
    const latest = useRef(props);
    latest.current = props;
    const key = JSON.stringify({
        noteId: props.noteId,
        branchId: props.branchId,
        block: props.block,
        language: props.language,
    });
    const keyRef = useRef(key);
    keyRef.current = key;
    const sourceText =
        props.block.sourceText?.trim() ||
        props.block.transcript?.segments
            .map((segment) => segment.text.replace(/^—\s*/u, ''))
            .join(' ') ||
        '';
    const [busy, setBusy] = useState(false);
    const [importing, setImporting] = useState(false);
    const [failed, setFailed] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [prepared, setPrepared] = useState<Prepared | null>(null);
    const [response, setResponse] = useState<SpeechResponse | null>(null);
    const operation = useRef<{
        controller: AbortController;
        key: string;
        block: AudioBlock;
        sourceText: string;
        confirmationId: string;
    } | null>(null);
    const previewUrl = useRef<string | null>(null);

    useEffect(() => {
        function clean() {
            operation.current?.controller.abort();
            operation.current = null;
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = null;
        }
        const unsubscribe = useSessionStore.subscribe((next, previous) => {
            if (
                next.status === 'authenticated' &&
                next.user?.id === previous.user?.id
            )
                return;
            clean();
            setPrepared(null);
            setAccepted(false);
            setResponse(null);
            setBusy(false);
            setImporting(false);
            setFailed(false);
        });
        return () => {
            clean();
            unsubscribe();
        };
    }, [props.noteId, props.branchId]);

    async function consume(
        result: SpeechResponse,
        current: NonNullable<typeof operation.current>,
    ) {
        const signal = current.controller.signal;
        const api = speechApi(latest.current.requestWithSession);
        const deadline = Date.now() + 600_000;
        signal.throwIfAborted();
        setResponse(result);
        while (
            ['queued', 'processing'].includes(result.state) &&
            result.requestId
        ) {
            if (Date.now() >= deadline)
                throw new Error('Audio preparation timed out.');
            await pause(
                Math.min(5000, Math.max(250, result.retryAfterMs ?? 1000)),
                signal,
            );
            result = await api.status(result.requestId, signal);
            signal.throwIfAborted();
            setResponse(result);
        }
        if (result.state !== 'ready' || !result.playbackId) return;
        const blob = await api.bytes(result.playbackId, signal);
        signal.throwIfAborted();
        const url = URL.createObjectURL(blob);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPrepared({
            key: current.key,
            block: current.block,
            sourceText: current.sourceText,
            response: result,
            url,
        });
    }

    async function generate() {
        operation.current?.controller.abort();
        const current = {
            controller: new AbortController(),
            key,
            block: props.block,
            sourceText,
            confirmationId: crypto.randomUUID(),
        };
        operation.current = current;
        setBusy(true);
        setImporting(false);
        setFailed(false);
        setAccepted(false);
        setResponse(null);
        try {
            const source = SpeechSourceSchema.parse({
                kind: 'knowledge-audio-draft',
                noteId: props.noteId,
                branchId: props.branchId,
                blockId: props.block.id,
                sourceText,
                language: props.language,
            });
            await consume(
                await speechApi(props.requestWithSession).prepare(
                    source,
                    current.controller.signal,
                ),
                current,
            );
        } catch {
            if (!current.controller.signal.aborted) setFailed(true);
        } finally {
            if (!current.controller.signal.aborted) setBusy(false);
        }
    }
    async function confirm() {
        const current = operation.current,
            quote = response?.quote;
        if (!current || !quote || current.key !== keyRef.current) return;
        setBusy(true);
        setFailed(false);
        try {
            await consume(
                await speechApi(props.requestWithSession).confirm(
                    quote.id,
                    current.confirmationId,
                    current.controller.signal,
                ),
                current,
            );
        } catch {
            if (!current.controller.signal.aborted) setFailed(true);
        } finally {
            if (!current.controller.signal.aborted) setBusy(false);
        }
    }
    async function accept() {
        if (
            !prepared ||
            prepared.key !== keyRef.current ||
            !prepared.response.playbackId ||
            busy
        )
            return;
        operation.current?.controller.abort();
        const current = {
            controller: new AbortController(),
            key: prepared.key,
            block: prepared.block,
            sourceText: prepared.sourceText,
            confirmationId: crypto.randomUUID(),
        };
        operation.current = current;
        setBusy(true);
        setImporting(true);
        setFailed(false);
        try {
            const result = await applyNarration(
                latest.current.requestWithSession,
                latest.current.noteId,
                prepared.response.playbackId,
                current.controller.signal,
            );
            current.controller.signal.throwIfAborted();
            if (prepared.key !== keyRef.current) return;
            const oldTranscript = prepared.block.transcript;
            const existingText = oldTranscript?.segments
                .map((segment) => segment.text.replace(/^—\s*/u, ''))
                .join(' ');
            const segments =
                existingText === prepared.sourceText && oldTranscript
                    ? oldTranscript.segments.map((segment) => ({
                          id: segment.id,
                          text: segment.text,
                      }))
                    : [{ id: crypto.randomUUID(), text: result.sourceText }];
            latest.current.onAccept({
                ...prepared.block,
                assetId: result.asset.id,
                sourceText: result.sourceText,
                transcript: { language: result.language, segments },
            });
            setAccepted(true);
            setPrepared(null);
            setResponse(null);
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = null;
        } catch {
            if (!current.controller.signal.aborted) setFailed(true);
        } finally {
            if (!current.controller.signal.aborted) {
                setBusy(false);
                setImporting(false);
            }
        }
    }
    function dismiss() {
        operation.current?.controller.abort();
        operation.current = null;
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = null;
        setPrepared(null);
        setResponse(null);
        setBusy(false);
        setImporting(false);
        setFailed(false);
    }
    function cancelQuote() {
        operation.current?.controller.abort();
        operation.current = null;
        setResponse(null);
        setBusy(false);
    }
    const stale = Boolean(prepared && prepared.key !== key);
    const staleQuote = Boolean(
        response?.quote && operation.current?.key !== key,
    );
    return {
        busy,
        importing,
        failed,
        accepted,
        prepared,
        response,
        stale,
        staleQuote,
        sourceText,
        generate,
        confirm,
        accept,
        dismiss,
        cancelQuote,
    };
}
