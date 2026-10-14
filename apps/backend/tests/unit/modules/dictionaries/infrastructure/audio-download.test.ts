import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import {
    downloadAudioResult,
    validateWav,
} from '../../../../../src/modules/dictionaries/infrastructure/audio/safe-audio-download';
import { audioChecksum } from '../../../../../src/modules/speech/domain/audio-integrity';

function pcmWav(samples = 24000, channels = 1): Buffer {
    const bytes = Buffer.alloc(44 + samples * channels * 2);
    bytes.write('RIFF');
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(channels, 22);
    bytes.writeUInt32LE(24000, 24);
    bytes.writeUInt32LE(24000 * channels * 2, 28);
    bytes.writeUInt16LE(channels * 2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(bytes.length - 44, 40);
    return bytes;
}

function serve(
    statusCode: number,
    chunks: Buffer[],
    headers: Record<string, string> = { 'content-type': 'audio/mpeg' },
) {
    mocks.request.mockImplementation((_url, _options, callback) => {
        const req = new EventEmitter() as EventEmitter & { end(): void };
        req.end = () => {
            const body = Readable.from(chunks);
            Object.assign(body, { statusCode, headers });
            callback(body);
        };
        return req;
    });
}

describe('bounded HTTPS audio transport', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    });
    it('pins the validated DNS address at connection time', async () => {
        mocks.lookup.mockResolvedValue([
            { address: '8.8.8.8', family: 4 },
            { address: '1.1.1.1', family: 4 },
        ]);
        const frame = Buffer.alloc(417);
        frame.set([255, 251, 144, 0]);
        serve(200, [frame]);
        const result = await downloadAudioResult('https://cdn.example.com/a', [
            'cdn.example.com',
        ]);
        expect(result.bytes).toEqual(frame);
        const pinnedLookup = mocks.request.mock.calls[0]![1].lookup;
        const callback = vi.fn();
        pinnedLookup('cdn.example.com', { all: false }, callback);
        expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
        callback.mockClear();
        pinnedLookup('cdn.example.com', { all: true }, callback);
        expect(callback).toHaveBeenCalledWith(null, [
            { address: '8.8.8.8', family: 4 },
        ]);
    });
    it.each(['audio/wav', 'audio/x-wav', 'application/octet-stream'])(
        'validates and preserves PCM WAV from %s transport',
        async (contentType) => {
            const bytes = pcmWav();
            serve(200, [bytes.subarray(0, 20), bytes.subarray(20)], {
                'content-type': contentType,
            });
            const result = await downloadAudioResult('https://cdn.example.com/a', [
                'cdn.example.com',
            ]);
            expect(result).toEqual({
                bytes,
                mimeType: 'audio/wav',
                checksum: audioChecksum(bytes),
                durationMs: 1000,
            });
        },
    );
    it('rejects a non-audio response despite an audio MIME', async () => {
        serve(200, [Buffer.from('<html>bad upstream</html>')], {
            'content-type': 'audio/wav',
        });
        await expect(
            downloadAudioResult('https://cdn.example.com/a', ['cdn.example.com']),
        ).rejects.toThrow('Invalid MP3');
    });
    it('rejects a mixed public/private DNS answer before connecting', async () => {
        mocks.lookup.mockResolvedValue([
            { address: '8.8.8.8', family: 4 },
            { address: '127.0.0.1', family: 4 },
        ]);
        await expect(
            downloadAudioResult('https://cdn.example.com/a', [
                'cdn.example.com',
            ]),
        ).rejects.toThrow('address');
        expect(mocks.request).not.toHaveBeenCalled();
    });
    it('rejects redirects without following Location', async () => {
        serve(302, [], { location: 'http://169.254.169.254/' });
        await expect(
            downloadAudioResult('https://cdn.example.com/a', [
                'cdn.example.com',
            ]),
        ).rejects.toThrow('response');
        expect(mocks.request).toHaveBeenCalledTimes(1);
    });
    it('bounds a streaming response even without Content-Length', async () => {
        serve(200, [Buffer.alloc(5 * 1024 * 1024), Buffer.alloc(1)]);
        await expect(
            downloadAudioResult('https://cdn.example.com/a', [
                'cdn.example.com',
            ]),
        ).rejects.toThrow('limit');
    });
    it('rejects oversized metadata before consuming body', async () => {
        serve(200, [], {
            'content-type': 'audio/mpeg',
            'content-length': String(6 * 1024 * 1024),
        });
        await expect(
            downloadAudioResult('https://cdn.example.com/a', [
                'cdn.example.com',
            ]),
        ).rejects.toThrow('response');
    });
});

describe('complete PCM WAV validation', () => {
    it('accepts mono and stereo PCM16 with exact sample duration', () => {
        expect(validateWav(pcmWav())).toBe(1000);
        expect(validateWav(pcmWav(12000, 2))).toBe(500);
    });
    it.each([
        ['RIFF size', (b: Buffer) => b.writeUInt32LE(b.length, 4)],
        ['container type', (b: Buffer) => b.write('AVI ', 8)],
        ['compressed codec', (b: Buffer) => b.writeUInt16LE(3, 20)],
        ['channel count', (b: Buffer) => b.writeUInt16LE(0, 22)],
        ['sample rate', (b: Buffer) => b.writeUInt32LE(0, 24)],
        ['byte rate', (b: Buffer) => b.writeUInt32LE(1, 28)],
        ['block alignment', (b: Buffer) => b.writeUInt16LE(1, 32)],
        ['sample size', (b: Buffer) => b.writeUInt16LE(8, 34)],
        ['data overflow', (b: Buffer) => b.writeUInt32LE(0xffffffff, 40)],
        ['empty data', (b: Buffer) => b.writeUInt32LE(0, 40)],
        ['unaligned data', (b: Buffer) => b.writeUInt32LE(1, 40)],
        ['format overflow', (b: Buffer) => b.writeUInt32LE(0xffffffff, 16)],
        ['alternate payload', (b: Buffer) => b.write('ID3 ', 36)],
    ] as const)('rejects malformed %s', (_name, mutate) => {
        const bytes = pcmWav();
        mutate(bytes);
        expect(() => validateWav(bytes)).toThrow();
    });
    it('rejects truncation and appended data even with a repaired RIFF size', () => {
        const truncated = pcmWav().subarray(0, 50);
        truncated.writeUInt32LE(truncated.length - 8, 4);
        expect(() => validateWav(truncated)).toThrow();
        const appended = Buffer.concat([pcmWav(), Buffer.from('script')]);
        appended.writeUInt32LE(appended.length - 8, 4);
        expect(() => validateWav(appended)).toThrow();
    });
    it('rejects duplicate data and format chunks', () => {
        for (const extra of [pcmWav().subarray(12, 36), pcmWav().subarray(36)]) {
            const bytes = Buffer.concat([pcmWav(), extra]);
            bytes.writeUInt32LE(bytes.length - 8, 4);
            expect(() => validateWav(bytes)).toThrow();
        }
    });
    it('accepts bounded padded ancillary chunks and rejects missing padding', () => {
        const junk = Buffer.alloc(10);
        junk.write('JUNK');
        junk.writeUInt32LE(1, 4);
        const wav = pcmWav();
        const bytes = Buffer.concat([wav.subarray(0, 36), junk, wav.subarray(36)]);
        bytes.writeUInt32LE(bytes.length - 8, 4);
        expect(validateWav(bytes)).toBe(1000);
        const unpadded = Buffer.concat([
            wav.subarray(0, 36),
            junk.subarray(0, 9),
            wav.subarray(36),
        ]);
        unpadded.writeUInt32LE(unpadded.length - 8, 4);
        expect(() => validateWav(unpadded)).toThrow();
    });
    it('requires a format before the audio samples', () => {
        const wav = pcmWav();
        const bytes = Buffer.concat([
            wav.subarray(0, 12),
            wav.subarray(36),
            wav.subarray(12, 36),
        ]);
        expect(() => validateWav(bytes)).toThrow('data');
    });
    it('rejects excessive duration even within the byte limit', () => {
        const bytes = pcmWav(24000 * 41);
        bytes.writeUInt32LE(8000, 24);
        bytes.writeUInt32LE(16000, 28);
        expect(() => validateWav(bytes)).toThrow('duration');
    });
});
