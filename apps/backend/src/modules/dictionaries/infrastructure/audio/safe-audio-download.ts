import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

import { audioChecksum, maximumAudioBytes } from './audio-integrity';

const blocked = new BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 3],
] as const)
    blocked.addSubnet(address, prefix, 'ipv4');
// Restrict IPv6 to global unicast, then exclude special-use allocations.
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAudioAddress(address: string): boolean {
    const family = isIP(address);
    return family === 4
        ? !blocked.check(address, 'ipv4')
        : family === 6 &&
              globalV6.check(address, 'ipv6') &&
              !blocked.check(address, 'ipv6');
}

export function validateAudioResultUrl(
    value: string,
    allowedHosts: readonly string[],
): URL {
    const url = new URL(value);
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash ||
        (url.port && url.port !== '443') ||
        isIP(url.hostname) ||
        !allowedHosts.includes(url.hostname.toLowerCase())
    )
        throw new Error('Untrusted audio result location.');
    return url;
}

/** Pins the validated DNS address into the TLS connection, preventing DNS rebinding. */
export async function downloadAudioResult(
    value: string,
    allowedHosts: readonly string[],
    parentSignal?: AbortSignal,
) {
    const signal = AbortSignal.any([
        AbortSignal.timeout(20_000),
        ...(parentSignal ? [parentSignal] : []),
    ]);
    const url = validateAudioResultUrl(value, allowedHosts);
    const addresses = await lookup(url.hostname, { all: true });
    signal.throwIfAborted();
    if (
        !addresses.length ||
        addresses.some(({ address }) => !isPublicAudioAddress(address))
    )
        throw new Error('Untrusted audio result address.');
    const pinned = addresses[0]!;
    const bytes = await new Promise<Buffer>((resolve, reject) => {
        const req = request(
            url,
            {
                signal,
                lookup: (_hostname, _options, callback) =>
                    callback(null, pinned.address, pinned.family),
                headers: { accept: 'audio/mpeg' },
            },
            (response) => {
                // Redirects are deliberately rejected; no credential or URL forwarding.
                if (
                    response.statusCode !== 200 ||
                    ![
                        'audio/mpeg',
                        'audio/mp3',
                        'application/octet-stream',
                    ].includes(
                        (response.headers['content-type'] ?? '').split(';')[0]!,
                    ) ||
                    Number(response.headers['content-length'] ?? 0) >
                        maximumAudioBytes
                ) {
                    response.destroy();
                    reject(new Error('Invalid audio download response.'));
                    return;
                }
                const chunks: Buffer[] = [];
                let size = 0;
                response.on('data', (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > maximumAudioBytes) {
                        response.destroy();
                        reject(new Error('Audio download exceeds limit.'));
                        return;
                    }
                    chunks.push(chunk);
                });
                response.on('error', () =>
                    reject(new Error('Audio download failed.')),
                );
                response.on('end', () => resolve(Buffer.concat(chunks)));
            },
        );
        req.on('error', () => reject(new Error('Audio download failed.')));
        req.end();
    });
    validateMp3(bytes);
    return {
        bytes,
        mimeType: 'audio/mpeg' as const,
        checksum: audioChecksum(bytes),
    };
}

/** Walk complete MPEG Layer III frames; reject non-audio, truncation, and >120s. */
export function validateMp3(bytes: Uint8Array): void {
    let offset = 0;
    let duration = 0;
    let frames = 0;
    if (Buffer.from(bytes.subarray(0, 3)).toString() === 'ID3') {
        if (bytes.length < 10 || [6, 7, 8, 9].some((i) => bytes[i]! > 127))
            throw new Error('Invalid MP3.');
        offset =
            10 +
            ((bytes[6]! << 21) |
                (bytes[7]! << 14) |
                (bytes[8]! << 7) |
                bytes[9]!) +
            (bytes[5]! & 16 ? 10 : 0);
    }
    while (offset + 4 <= bytes.length) {
        if (
            bytes.length - offset === 128 &&
            Buffer.from(bytes.subarray(offset, offset + 3)).toString() === 'TAG'
        ) {
            offset += 128;
            break;
        }
        const a = bytes[offset]!;
        const b = bytes[offset + 1]!;
        const c = bytes[offset + 2]!;
        const version = (b >> 3) & 3;
        const layer = (b >> 1) & 3;
        const rateIndex = (c >> 2) & 3;
        const bitrateIndex = c >> 4;
        if (
            a !== 255 ||
            (b & 224) !== 224 ||
            version === 1 ||
            layer !== 1 ||
            rateIndex === 3 ||
            bitrateIndex === 0 ||
            bitrateIndex === 15
        )
            throw new Error('Invalid MP3.');
        const rate =
            [44100, 48000, 32000][rateIndex]! /
            (version === 3 ? 1 : version === 2 ? 2 : 4);
        const bitrates =
            version === 3
                ? [
                      0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224,
                      256, 320,
                  ]
                : [
                      0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144,
                      160,
                  ];
        offset +=
            Math.floor(
                ((version === 3 ? 144 : 72) * bitrates[bitrateIndex]! * 1000) /
                    rate,
            ) +
            ((c >> 1) & 1);
        duration += (version === 3 ? 1152 : 576) / rate;
        frames++;
        if (duration > 120 || offset > bytes.length)
            throw new Error('Audio duration or frame exceeds limit.');
    }
    if (!frames || offset !== bytes.length || bytes.length > maximumAudioBytes)
        throw new Error('Invalid MP3.');
}
