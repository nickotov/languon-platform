import { expect, it } from 'vitest';
import { createFixtureAudio } from '../../speech/domain/audio-integrity';
import { verifyKnowledgeAudio } from './media-audio-validation';

it('validates PCM WAV bytes and derives duration rather than trusting metadata', () => {
    const audio = createFixtureAudio();
    expect(verifyKnowledgeAudio(audio.bytes, 'audio/wav')).toMatchObject({
        mimeType: 'audio/wav',
        durationMs: 1000,
        bytes: audio.bytes,
    });
});
it('rejects spoofed MIME, corrupt WAV bounds and invalid sample layout', () => {
    const audio = createFixtureAudio();
    expect(() =>
        verifyKnowledgeAudio(
            new TextEncoder().encode('<svg onload="alert(1)">'),
            'audio/wav',
        ),
    ).toThrow();
    expect(() => verifyKnowledgeAudio(audio.bytes, 'text/html')).toThrow();
    const corrupt = Buffer.from(audio.bytes);
    corrupt.writeUInt32LE(0xffffffff, 40);
    expect(() => verifyKnowledgeAudio(corrupt, 'audio/wav')).toThrow();
    const invalid = Buffer.from(audio.bytes);
    invalid.writeUInt16LE(8, 32);
    expect(() => verifyKnowledgeAudio(invalid, 'audio/wav')).toThrow();
});
it('parses MP3 frames, strips ID3 metadata and rejects arbitrary trailing bytes', () => {
    const frame = Buffer.alloc(417);
    frame.set([0xff, 0xfb, 0x90, 0]);
    const header = Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 4]);
    const supplied = Buffer.concat([header, Buffer.from('<svg'), frame]);
    const parsed = verifyKnowledgeAudio(supplied, 'audio/mpeg');
    expect(parsed.bytes).toEqual(frame);
    expect(parsed.durationMs).toBe(27);
    expect(() =>
        verifyKnowledgeAudio(
            Buffer.concat([frame, Buffer.from('<script>')]),
            'audio/mpeg',
        ),
    ).toThrow();
    expect(() =>
        verifyKnowledgeAudio(frame.subarray(0, 400), 'audio/mpeg'),
    ).toThrow();
});
