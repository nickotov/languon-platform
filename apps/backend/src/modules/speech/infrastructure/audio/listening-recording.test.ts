import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyKnowledgeAudio } from '../../../knowledge/infrastructure/media-audio-validation';
import {
    audioChecksum,
    createFixtureAudio,
} from '../../domain/audio-integrity';
import { assembleListeningRecording } from './listening-recording';

function tone(seconds: number, frequency: number) {
    const audio = createFixtureAudio();
    const bytes = Buffer.alloc(44 + seconds * 32000);
    Buffer.from(audio.bytes).copy(bytes, 0, 0, 44);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.writeUInt32LE(bytes.length - 44, 40);
    for (let sample = 0; sample < seconds * 16000; sample++) {
        bytes.writeInt16LE(
            Math.round(
                5000 * Math.sin((2 * Math.PI * frequency * sample) / 16000),
            ),
            44 + sample * 2,
        );
    }

    return {
        bytes,
        mimeType: 'audio/wav' as const,
        checksum: audioChecksum(bytes),
        durationMs: 500,
    };
}

function dialogue(seconds: number) {
    return [
        {
            id: randomUUID(),
            speaker: 'Anne',
            text: 'Bonjour.',
            audio: tone(seconds, 330),
        },
        {
            id: randomUUID(),
            speaker: 'Luc',
            text: 'Salut !',
            audio: tone(seconds, 550),
        },
    ];
}

function frequencyAt(bytes: Uint8Array, start: number) {
    const pcm = Buffer.from(bytes);
    const offset = 44 + Math.round(start * 16000) * 2;
    let crossings = 0;
    for (let i = offset + 2; i < offset + 32000; i += 2) {
        if (pcm.readInt16LE(i - 2) <= 0 && pcm.readInt16LE(i) > 0) {
            crossings++;
        }
    }

    return crossings;
}

describe('listening assembly', () => {
    it('measures sample boundaries and keeps speaker names out of dictation text', async () => {
        const audio = { ...createFixtureAudio(), durationMs: 500 };
        const utterances = [
            { id: randomUUID(), speaker: 'Anne', text: 'Bonjour.', audio },
            { id: randomUUID(), speaker: 'Luc', text: 'Salut !', audio },
        ];
        const result = await assembleListeningRecording({
            language: 'fr',
            utterances,
        });

        expect(result.audio.durationMs).toBe(2250);
        expect(result.transcript.segments).toMatchObject([
            {
                speaker: 'Anne',
                text: 'Bonjour.',
                timing: { startSeconds: 0, endSeconds: 1 },
            },
            {
                speaker: 'Luc',
                text: 'Salut !',
                timing: { startSeconds: 1.25, endSeconds: 2.25 },
            },
        ]);
    });

    it('fits a 64-second dialogue into one minute using measured samples, preserving both voices and recomputing cue boundaries', async () => {
        const utterances = dialogue(32);
        const result = await assembleListeningRecording({
            language: 'fr',
            maxDurationSeconds: 60,
            utterances,
        });
        const { durationMs } = verifyKnowledgeAudio(
            result.audio.bytes,
            result.audio.mimeType,
        );

        expect(durationMs).toBeLessThanOrEqual(60000);
        expect(durationMs).toBeGreaterThan(59000);
        expect(
            result.transcript.segments.map((segment) => [
                segment.id,
                segment.speaker,
                segment.text,
            ]),
        ).toEqual(utterances.map((line) => [line.id, line.speaker, line.text]));

        const [first, last] = result.transcript.segments.map(
            (segment) => segment.timing!,
        );

        expect(first!.startSeconds).toBe(0);
        expect(last!.startSeconds).toBeCloseTo(first!.endSeconds + 0.25, 5);
        expect(last!.endSeconds).toBe((result.audio.bytes.length - 44) / 32000);
        expect(frequencyAt(result.audio.bytes, 1)).toBeCloseTo(330, -1);
        expect(
            frequencyAt(result.audio.bytes, last!.endSeconds - 2),
        ).toBeCloseTo(550, -1);
    });

    it('declines an oversized dialogue without clipping utterances or returning audio', async () => {
        await expect(
            assembleListeningRecording({
                language: 'fr',
                maxDurationSeconds: 60,
                utterances: dialogue(37),
            }),
        ).rejects.toMatchObject({ code: 'speech_duration_exceeded' });
    });
});
