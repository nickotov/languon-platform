import {
    DictionaryCardValuesSchema,
    type DictionaryGenerationCandidate,
    type DictionaryGenerationField,
} from '@languon/contracts';
import { type ChangeEvent, useEffect, useState } from 'react';

import type { GenerationReviewProps } from '../model/generation-review';

export function useGenerationReview(props: GenerationReviewProps) {
    const { available, card, conflict, job, pendingAction } = props;
    const [instruction, setInstruction] = useState('');
    const [candidate, setCandidate] =
        useState<DictionaryGenerationCandidate | null>(
            job?.proposal?.candidate ?? null,
        );

    useEffect(() => {
        setCandidate(job?.proposal?.candidate ?? null);
    }, [job?.id, job?.proposal]);

    const busy = job?.state === 'queued' || job?.state === 'running';
    const ready =
        job?.state === 'review' &&
        Boolean(job.originalSnapshot && job.proposal && candidate);
    const settings = job?.originalSnapshot?.effectiveSettings;
    const notation =
        candidate?.overrides.transcriptionNotation ??
        settings?.transcriptionNotation;
    const customLabel =
        candidate?.overrides.transcriptionCustomLabel ??
        settings?.transcriptionCustomLabel;
    const invalidCandidate =
        !DictionaryCardValuesSchema.safeParse(candidate?.values).success ||
        (notation === 'custom' && !customLabel?.trim());
    const acceptDisabled =
        pendingAction || Boolean(conflict) || invalidCandidate;
    const generateDisabled = !available || pendingAction || (!job && !card);
    const cancelDisabled = pendingAction || Boolean(job?.cancellationRequested);
    const instructionDisabled = busy || pendingAction;
    const retryable = job?.state === 'failed' && job.failure?.retryable;
    const canGenerate = job?.state !== 'failed' || retryable;

    function handleInstructionChange(event: ChangeEvent<HTMLTextAreaElement>) {
        setInstruction(event.currentTarget.value);
    }

    function changeValue(field: DictionaryGenerationField, value: string) {
        const required = field === 'source' || field === 'translation';
        const limit = required ? 200 : 2000;
        const boundedValue = Array.from(value).slice(0, limit).join('');
        const normalized = boundedValue || (required ? '' : null);
        setCandidate((current) =>
            current
                ? {
                      ...current,
                      values: { ...current.values, [field]: normalized },
                  }
                : current,
        );
    }

    async function run(action: () => Promise<void>) {
        try {
            await action();
        } catch {
            // The owning mutation supplies the actionable error and keeps the draft.
        }
    }

    function handleGenerate() {
        const action = ready || retryable ? props.onRegenerate : props.onStart;
        const value = instruction.trim() || undefined;
        void run(() => action(value));
    }

    function handleAccept() {
        if (!candidate || acceptDisabled) return;
        void run(() => props.onAccept(candidate));
    }

    function handleDiscard() {
        void run(props.onDiscard);
    }

    function handleCancel() {
        void run(props.onCancel);
    }

    function handleReload() {
        void run(props.onReloadCompare);
    }

    return {
        instruction,
        candidate,
        busy,
        ready,
        acceptDisabled,
        generateDisabled,
        cancelDisabled,
        instructionDisabled,
        canGenerate,
        changeValue,
        handleInstructionChange,
        handleGenerate,
        handleAccept,
        handleDiscard,
        handleCancel,
        handleReload,
    };
}

export type GenerationReviewState = ReturnType<typeof useGenerationReview>;
