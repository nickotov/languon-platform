import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SpeechResponse } from '@languon/contracts';
import type { SpeechProfileResolver } from '../../application/ports';
import type { SpeechService } from '../../application/speech-service';
import { SpeechError } from '../../domain/speech-policy';
import {
    assembleListeningRecording,
    checkListeningDecoder,
} from './listening-recording';
import { verifyKnowledgeAudio } from '../../../knowledge/infrastructure/media-audio-validation';
import { sql } from 'drizzle-orm';
import type { DrizzleKnowledgeMediaStore } from '../../../knowledge/infrastructure/persistence/drizzle/media-store';

export const listeningUtteranceSchema = z
    .object({
        id: z.string().uuid(),
        speaker: z.string().trim().min(1).max(60),
        text: z.string().trim().min(1).max(300),
    })
    .strict();
type Utterance = z.infer<typeof listeningUtteranceSchema>;
interface ListeningScope {
    ownerId: string;
    noteId: string;
    branchId: string;
    turnId: string;
    leaseToken: string;
    runId: string;
    revision: number;
    taskId: string;
    language: string;
}
export type ListeningSpeechInput = ListeningScope & {
    utterances: readonly Utterance[];
    maxDurationSeconds?: number;
    signal?: AbortSignal;
};
export type ListeningUtteranceAdmission = Omit<ListeningScope, 'ownerId'> & {
    actorId: string;
    utterance: Utterance;
    operationId: string;
    voice: string;
    now: Date;
};

function assetIdentity(scope: ListeningScope) {
    const bytes = createHash('sha256')
        .update(
            JSON.stringify([
                'knowledge-listening-asset',
                scope.runId,
                scope.revision,
                scope.taskId,
            ]),
        )
        .digest();

    bytes[6] = (bytes[6]! & 15) | 128;
    bytes[8] = (bytes[8]! & 63) | 128;
    const hex = bytes.subarray(0, 16).toString('hex');

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join('-');
}

export function createListeningRecordingPreparer(deps: {
    enqueue(
        input: readonly ListeningUtteranceAdmission[],
    ): Promise<SpeechResponse[]>;
    provider: SpeechProfileResolver;
    service: Pick<SpeechService, 'content'>;
    pending(bindingId: string): Promise<never>;
    media: Pick<DrizzleKnowledgeMediaStore, 'upload'>;
}) {
    return async ({
        signal,
        utterances: rawUtterances,
        maxDurationSeconds,
        ownerId,
        ...scope
    }: ListeningSpeechInput) => {
        const utterances = z
            .array(listeningUtteranceSchema)
            .min(1)
            .max(8)
            .parse(rawUtterances);
        const speakers = [...new Set(utterances.map((item) => item.speaker))];
        const profile = deps.provider.supports(scope.language);
        if (
            !profile ||
            speakers.length > 2 ||
            (speakers.length > 1 &&
                (!profile.dialogueVoice ||
                    profile.dialogueVoice === profile.voice))
        ) {
            throw new SpeechError('speech_voice_unavailable');
        }

        if (
            new Set(utterances.map((item) => item.id)).size !==
            utterances.length
        ) {
            throw new SpeechError('speech_utterance_identity_invalid');
        }

        await checkListeningDecoder(signal);
        const playback = [];
        signal?.throwIfAborted();
        const states = await deps.enqueue(
            utterances.map((utterance) => ({
                ...scope,
                actorId: ownerId,
                utterance,
                operationId: utterance.id,
                voice:
                    utterance.speaker === speakers[0]
                        ? profile.voice
                        : profile.dialogueVoice!,
                now: new Date(),
            })),
        );

        if (states.length !== utterances.length) {
            throw new SpeechError('speech_admission_incomplete');
        }

        for (const [index, state] of states.entries()) {
            const utterance = utterances[index]!;
            if (
                state.requestId &&
                (state.state === 'queued' || state.state === 'processing')
            ) {
                await deps.pending(state.requestId);
            }

            if (state.state === 'submission_unknown') {
                throw new SpeechError('speech_submission_unknown');
            }

            if (state.state !== 'ready' || !state.playbackId) {
                throw new SpeechError({
                    recordingFailure:
                        state.error ?? 'speech_recording_unavailable',
                });
            }

            playback.push({ utterance, playbackId: state.playbackId });
        }

        const clips = [];
        for (const { utterance, playbackId } of playback) {
            const recording = await deps.service.content(
                ownerId,
                playbackId,
                signal,
            );

            if (
                recording.text !== utterance.text ||
                recording.language !== scope.language
            ) {
                throw new SpeechError('speech_source_changed');
            }

            clips.push({ ...utterance, audio: recording.audio });
        }

        const { audio, transcript } = await assembleListeningRecording({
            language: scope.language,
            utterances: clips,
            ...(maxDurationSeconds !== undefined ? { maxDurationSeconds } : {}),
            ...(signal ? { signal } : {}),
        });

        signal?.throwIfAborted();
        const asset = await deps.media.upload(
            ownerId,
            scope.noteId,
            verifyKnowledgeAudio(audio.bytes, audio.mimeType),
            assetIdentity({ ...scope, ownerId }),
            async (tx) => {
                const live =
                    await tx.execute(sql`select 1 from conversation_turns t
                    join conversation_generation_runs r on r.active_turn_id=t.id
                    join knowledge_working_branches b on b.note_id=r.note_id
                    where t.id=${scope.turnId}::uuid and t.lease_token=${scope.leaseToken}::uuid
                      and t.status='running' and t.lease_until>clock_timestamp() and not t.cancel_requested
                      and r.id=${scope.runId}::uuid and r.revision=${scope.revision}
                      and r.owner_id=${ownerId}::uuid and r.note_id=${scope.noteId}::uuid
                      and r.state='running' and b.id=${scope.branchId}::uuid for share of r,t,b`);

                if (!live.length) {
                    throw new SpeechError('listening_authorization_expired');
                }
            },
        );

        return { assetId: asset.id, transcript };
    };
}
