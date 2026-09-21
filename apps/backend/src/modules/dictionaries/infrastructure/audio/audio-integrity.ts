import { createHash } from 'node:crypto';

import type { AudioBytes } from '../../application/ports/audio-object-storage';

export const maximumAudioBytes = 5 * 1024 * 1024;
export function audioChecksum(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

export function assertAudioIntegrity(audio: AudioBytes): void {
    if (
        !audio.bytes.length ||
        audio.bytes.length > maximumAudioBytes ||
        audioChecksum(audio.bytes) !== audio.checksum ||
        !['audio/mpeg', 'audio/wav'].includes(audio.mimeType)
    ) {
        throw new Error('Invalid audio integrity.');
    }
}

/** A short audible PCM tone: development fixture, never arbitrary-text pronunciation. */
export function createFixtureAudio(): AudioBytes {
    const samples = 16000;
    const bytes = Buffer.alloc(44 + samples * 2);
    bytes.write('RIFF');
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(16000, 24);
    bytes.writeUInt32LE(32000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) {
        const envelope = Math.min(i / 800, (samples - i) / 800, 1);
        bytes.writeInt16LE(
            Math.round(Math.sin((i * Math.PI * 880) / 16000) * 5000 * envelope),
            44 + i * 2,
        );
    }
    return { bytes, checksum: audioChecksum(bytes), mimeType: 'audio/wav' };
}
