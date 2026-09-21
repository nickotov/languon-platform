import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { downloadAudioResult } from '../../../../../src/modules/dictionaries/infrastructure/audio/safe-audio-download';

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
        const frame = Buffer.alloc(417);
        frame.set([255, 251, 144, 0]);
        serve(200, [frame]);
        const result = await downloadAudioResult('https://cdn.example.com/a', [
            'cdn.example.com',
        ]);
        expect(result.bytes).toEqual(frame);
        const pinnedLookup = mocks.request.mock.calls[0]![1].lookup;
        const callback = vi.fn();
        pinnedLookup('cdn.example.com', {}, callback);
        expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
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
