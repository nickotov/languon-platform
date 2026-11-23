import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFixtureAudio } from '../../domain/audio-integrity';
import { assembleListeningRecording } from './listening-recording';

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
});
