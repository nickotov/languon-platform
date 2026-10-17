import { TextLanguageSchema, type TextDocument } from '@languon/contracts';
import { useEffect, useRef, useState } from 'react';
import type { WorkspaceInput } from '../lib/workspace-content';
import type { useTextWorkspaceJob } from './use-text-workspace-job';

type Job = ReturnType<typeof useTextWorkspaceJob>;

export function useTextWorkspaceAuto(options: {
    input: WorkspaceInput;
    folderId: string;
    document: TextDocument | null;
    detection: Job;
    translation: Job;
    isCurrent(): boolean;
    setInput?(input: WorkspaceInput): void;
}) {
    const { input, folderId, document, detection, translation, isCurrent } =
        options;
    const [detecting, setDetecting] = useState(false);
    const [error, setError] = useState<'unknown' | 'same' | null>(null);
    const continuation = useRef<string | null>(null);
    const fingerprint = JSON.stringify([
        input.sourceText,
        input.sourceLanguage,
        input.targetLanguage,
    ]);
    const resolved = useRef<{ fingerprint: string; language: string } | null>(
        null,
    );
    const current = useRef(fingerprint);
    current.current = fingerprint;

    function reset() {
        continuation.current = null;
        setDetecting(false);
        setError(null);
    }

    function invalidate() {
        reset();
        if (detection.active) void detection.cancel().catch(() => undefined);
        if (translation.active)
            void translation.cancel().catch(() => undefined);
        detection.clear();
        translation.clear();
    }

    useEffect(() => {
        invalidate();
    }, [fingerprint]);

    async function startTranslation(sourceLanguage: string) {
        await translation.start({
            folderId,
            sourceText: input.sourceText,
            sourceLanguage: TextLanguageSchema.parse(sourceLanguage),
            targetLanguage: TextLanguageSchema.parse(input.targetLanguage),
            operationId: crypto.randomUUID(),
            ...(document
                ? { textId: document.id, expectedTextVersion: document.version }
                : {}),
        });
    }

    async function start() {
        if (continuation.current || detection.active || translation.active)
            return;
        setError(null);
        if (input.sourceLanguage !== 'auto')
            return startTranslation(input.sourceLanguage);
        if (resolved.current?.fingerprint === fingerprint)
            return startTranslation(resolved.current.language);
        continuation.current = fingerprint;
        setDetecting(true);
        await detection.start(
            {
                folderId,
                sourceText: input.sourceText,
                operationId: crypto.randomUUID(),
            },
            true,
        );
    }

    useEffect(() => {
        const expected = continuation.current;
        if (!expected || current.current !== expected || !isCurrent()) return;
        const job = detection.job;
        if (
            detection.error ||
            job?.state === 'failed' ||
            job?.state === 'cancelled'
        ) {
            continuation.current = null;
            setDetecting(false);
            setError('unknown');
            return;
        }
        const result = job?.result;
        if (!result || !('confidence' in result)) return;
        continuation.current = null;
        setDetecting(false);
        const language = TextLanguageSchema.safeParse(result.language);
        if (!language.success) {
            setError('unknown');
            return;
        }
        if (language.data === input.targetLanguage) {
            setError('same');
            return;
        }
        resolved.current = { fingerprint: expected, language: language.data };
        void startTranslation(language.data);
    }, [detection.job, detection.error, fingerprint]);

    function changeInput(next: WorkspaceInput) {
        if (
            next.sourceText !== input.sourceText ||
            next.sourceLanguage !== input.sourceLanguage ||
            next.targetLanguage !== input.targetLanguage
        )
            invalidate();
        options.setInput?.(next);
    }

    return { start, invalidate, detecting, error, changeInput };
}
