import { randomUUID } from 'node:crypto';
import type { SpeechResponse } from '@languon/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createFixtureAudio } from '../../domain/audio-integrity';
import {
    createListeningRecordingPreparer,
    type ListeningUtteranceAdmission,
} from './prepare-listening-recording';

const ready: SpeechResponse = {
    state: 'ready',
    requestId: null,
    playbackId: null,
    quote: null,
    fixture: true,
    retryAfterMs: null,
    error: null,
    billingState: 'free',
};

function fixture(dialogueVoice?: string) {
    const utterances = [
        { id: randomUUID(), speaker: 'Anne', text: 'Bonjour !' },
        { id: randomUUID(), speaker: 'Luc', text: 'Salut !' },
    ];
    const input = {
        ownerId: randomUUID(),
        branchId: randomUUID(),
        noteId: randomUUID(),
        turnId: randomUUID(),
        runId: randomUUID(),
        leaseToken: randomUUID(),
        revision: 1,
        taskId: 'recording',
        language: 'fr',
        utterances,
    };
    const jobs = new Set<string>();
    const enqueue = vi.fn(
        async (
            items: readonly ListeningUtteranceAdmission[],
        ): Promise<SpeechResponse[]> =>
            items.map(({ operationId }) =>
                jobs.has(operationId)
                    ? { ...ready, playbackId: operationId }
                    : { ...ready, state: 'queued', requestId: operationId },
            ),
    );
    const pending = vi.fn(async (request: string): Promise<never> => {
        jobs.add(request);

        throw new Error('queued');
    });
    const media = {
        upload: vi.fn(
            async (
                _owner: string,
                _note: string,
                audio: {
                    durationMs: number;
                    bytes: Uint8Array;
                    mimeType: 'audio/wav' | 'audio/mpeg';
                },
                assetId?: string,
            ) => ({
                id: assetId!,
                byteLength: audio.bytes.length,
                durationMs: audio.durationMs,
                mimeType: audio.mimeType,
            }),
        ),
    };
    const prepare = createListeningRecordingPreparer({
        enqueue,
        pending,
        media,
        provider: {
            supports: () => ({
                language: 'fr',
                provider: 'fixture',
                model: 'test',
                configurationId: 'fixture',
                settingsVersion: '1',
                estimatedCostUnitsPerCharacter: 1,
                voice: 'first',
                ...(dialogueVoice ? { dialogueVoice } : {}),
            }),
        },
        service: {
            content: async (_owner, id) => ({
                audio: createFixtureAudio(),
                fixture: true,
                text: utterances.find((s) => s.id === id)!.text,
                language: 'fr',
            }),
        },
    });

    return { input, prepare, enqueue, pending, media };
}

describe('prepare listening recording', () => {
    it('reuses both utterance jobs, preserves voices and replays the same note asset identity', async () => {
        const { prepare, input, pending, enqueue, media } = fixture('second');
        await expect(prepare(input)).rejects.toThrow('queued');
        await expect(prepare(input)).rejects.toThrow('queued');
        const one = await prepare(input);
        const two = await prepare(input);
        expect(two).toEqual(one);
        for (const [batch] of enqueue.mock.calls) {
            expect(batch.map((item) => item.voice)).toEqual([
                'first',
                'second',
            ]);
        }

        expect(pending.mock.calls.map(([id]) => id)).toEqual(
            input.utterances.map((turn) => turn.id),
        );

        expect(
            media.upload.mock.calls.map(([owner, note, , id]) => [
                owner,
                note,
                id,
            ]),
        ).toEqual([
            [input.ownerId, input.noteId, one.assetId],
            [input.ownerId, input.noteId, one.assetId],
        ]);
    });

    it.each([undefined, 'first'])(
        'rejects an unavailable or repeated second voice before submitting either utterance',
        async (voice) => {
            const { prepare, input, enqueue } = fixture(voice);
            await expect(prepare(input)).rejects.toMatchObject({
                code: 'speech_voice_unavailable',
            });

            expect(enqueue).not.toHaveBeenCalled();
        },
    );

    it('declines an overlong completed recording before note asset publication', async () => {
        const { prepare, input, enqueue, pending, media } = fixture('second');
        enqueue.mockResolvedValue(
            input.utterances.map((item) => ({ ...ready, playbackId: item.id })),
        );

        await expect(
            prepare({ ...input, maxDurationSeconds: 1 }),
        ).rejects.toMatchObject({ code: 'speech_duration_exceeded' });

        expect(pending).not.toHaveBeenCalled();
        expect(media.upload).not.toHaveBeenCalled();
    });

    it('stops on unknown delivery without retrying or admitting another clip', async () => {
        const { prepare, input, enqueue, pending, media } = fixture('second');
        enqueue.mockResolvedValueOnce([
            { ...ready, state: 'submission_unknown' },
            ready,
        ]);

        await expect(prepare(input)).rejects.toMatchObject({
            code: 'speech_submission_unknown',
        });

        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(pending).not.toHaveBeenCalled();
        expect(media.upload).not.toHaveBeenCalled();
    });
});
