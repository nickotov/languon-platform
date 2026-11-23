import { GenerationExecutionFailure } from './generation-failure';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LearningTranscript } from '@languon/contracts';

export const listeningScriptSchema = z
    .object({
        title: z.string().trim().min(1).max(120),
        utterances: z
            .array(
                z
                    .object({
                        speaker: z.string().trim().min(1).max(60),
                        text: z.string().trim().min(1).max(300),
                    })
                    .strict(),
            )
            .min(1)
            .max(8),
    })
    .strict();

export type ListeningScript = z.infer<typeof listeningScriptSchema>;
export function identifyListeningScript(script: ListeningScript) {
    return {
        ...script,
        utterances: script.utterances.map((utterance) => ({
            ...utterance,
            id: randomUUID(),
        })),
    };
}

export type FrozenListeningScript = ReturnType<typeof identifyListeningScript>;
export interface ListeningRecordingRequest {
    runId: string;
    revision: number;
    taskId: string;
    validationId: string;
    language: string;
    script: ListeningScript;
}
export type PrepareListeningRecording = (input: {
    runId: string;
    revision: number;
    taskId: string;
    language: string;
    ownerId: string;
    noteId: string;
    branchId: string;
    turnId: string;
    leaseToken: string;
    utterances: FrozenListeningScript['utterances'];
    signal: AbortSignal;
}) => Promise<{ assetId: string; transcript: LearningTranscript }>;

/** Preserve safe, actionable speech failures without exposing provider payloads. */
export function listeningRecordingFailure(error: unknown, taskId: string) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return error;
    }

    const reasons = {
        listening_authorization_required: 'allowance-required',
        listening_authorization_expired: 'authority-expired',
        listening_budget_exhausted: 'allowance-required',
        speech_voice_unavailable: 'configuration',
        speech_decoder_unavailable: 'configuration',
        speech_source_changed: 'source-changed',
    } as const;
    const code = error.code;
    if (typeof code === 'string' && Object.hasOwn(reasons, code)) {
        return new GenerationExecutionFailure({
            code: 'admission-blocked',
            admissionReason: reasons[code as keyof typeof reasons],
            taskId,
        });
    }

    if (code === 'speech_submission_unknown') {
        return new GenerationExecutionFailure({
            code: 'provider-outcome-unknown',
            taskId,
        });
    }

    if (typeof code === 'string' && code.startsWith('speech_')) {
        return new GenerationExecutionFailure({
            code: 'provider-rejected',
            taskId,
        });
    }

    return error;
}
