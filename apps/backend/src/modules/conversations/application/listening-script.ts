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

/** Two spoken words per second, with time for natural pauses between lines.
 * The decoded recording is measured separately before publication. */
function listeningWordBudget(seconds: number, utteranceCount: number) {
    return Math.max(1, Math.floor((seconds - (utteranceCount - 1) * 0.5) * 2));
}

export function validateListeningScriptDuration(
    script: ListeningScript,
    maxDurationSeconds: number | undefined,
) {
    if (maxDurationSeconds === undefined) {
        return;
    }

    const words = new Intl.Segmenter('und', { granularity: 'word' });
    const count = script.utterances.reduce(
        (total, { text }) =>
            total +
            Array.from(words.segment(text)).filter((part) => part.isWordLike)
                .length,
        0,
    );

    if (
        count >
        listeningWordBudget(maxDurationSeconds, script.utterances.length)
    ) {
        throw new z.ZodError([
            {
                code: 'custom',
                path: ['utterances', 'maxDurationSeconds'],
                message:
                    'Shorten the script to fit the requested playback time.',
            },
        ]);
    }
}

export type FrozenListeningScript = ReturnType<typeof identifyListeningScript>;
export interface ListeningRecordingRequest {
    runId: string;
    revision: number;
    taskId: string;
    validationId: string;
    language: string;
    maxDurationSeconds?: number;
    script: ListeningScript;
}
export type PrepareListeningRecording = (input: {
    runId: string;
    revision: number;
    taskId: string;
    language: string;
    maxDurationSeconds?: number;
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
        speech_voice_unavailable: 'speech-voice-unavailable',
        speech_decoder_unavailable: 'speech-decoder-unavailable',
        speech_duration_exceeded: 'recording-too-long',
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
