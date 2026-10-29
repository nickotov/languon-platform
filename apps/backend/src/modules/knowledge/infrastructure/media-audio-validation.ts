import { knowledgeAudioMaximumBytes } from '@languon/contracts';
import type { VerifiedKnowledgeAudio } from '../application/media-store';
import { KnowledgeDomainError } from '../domain/knowledge';

function invalid(): never {
    throw new KnowledgeDomainError(
        'invalid_request',
        'Upload a valid WAV or MP3 recording up to 5 MiB and 30 minutes.',
    );
}

/** Parse supported audio containers and strip metadata; the browser receives no caller HTML. */
export function verifyKnowledgeAudio(
    input: Uint8Array,
    mime: string,
): VerifiedKnowledgeAudio {
    if (!input.length || input.length > knowledgeAudioMaximumBytes) invalid();
    const bytes = Buffer.from(input);
    if (mime === 'audio/wav') {
        if (
            bytes.length < 44 ||
            bytes.toString('ascii', 0, 4) !== 'RIFF' ||
            bytes.toString('ascii', 8, 12) !== 'WAVE' ||
            bytes.readUInt32LE(4) + 8 !== bytes.length
        )
            invalid();
        let offset = 12;
        let format: Buffer | undefined;
        let data: Buffer | undefined;
        while (offset + 8 <= bytes.length) {
            const name = bytes.toString('ascii', offset, offset + 4);
            const size = bytes.readUInt32LE(offset + 4);
            const end = offset + 8 + size;
            if (end > bytes.length) invalid();
            if (name === 'fmt ') {
                if (format || size !== 16) invalid();
                format = bytes.subarray(offset + 8, end);
            }
            if (name === 'data') {
                if (data || !size) invalid();
                data = bytes.subarray(offset + 8, end);
            }
            offset = end + (size % 2);
        }
        if (offset !== bytes.length || !format || !data) invalid();
        const channels = format.readUInt16LE(2),
            rate = format.readUInt32LE(4),
            depth = format.readUInt16LE(14);
        const alignment = (channels * depth) / 8;
        if (
            format.readUInt16LE(0) !== 1 ||
            ![1, 2].includes(channels) ||
            rate < 8000 ||
            rate > 192000 ||
            ![8, 16, 24, 32].includes(depth) ||
            format.readUInt16LE(12) !== alignment ||
            format.readUInt32LE(8) !== rate * alignment ||
            data.length % alignment
        )
            invalid();
        const durationMs = Math.ceil((data.length / (rate * alignment)) * 1000);
        if (durationMs > 1_800_000) invalid();
        const output = Buffer.alloc(44 + data.length + (data.length % 2));
        output.write('RIFF');
        output.writeUInt32LE(output.length - 8, 4);
        output.write('WAVEfmt ', 8);
        output.writeUInt32LE(16, 16);
        format.copy(output, 20);
        output.write('data', 36);
        output.writeUInt32LE(data.length, 40);
        data.copy(output, 44);
        return { bytes: output, mimeType: 'audio/wav', durationMs };
    }
    if (mime !== 'audio/mpeg') invalid();
    let start = 0,
        end = bytes.length;
    if (bytes.toString('ascii', 0, 3) === 'ID3') {
        if (
            bytes.length < 10 ||
            ![3, 4].includes(bytes[3]!) ||
            bytes[5]! & 0x10 ||
            [6, 7, 8, 9].some((i) => bytes[i]! & 0x80)
        )
            invalid();
        start =
            10 +
            ((bytes[6]! << 21) |
                (bytes[7]! << 14) |
                (bytes[8]! << 7) |
                bytes[9]!);
        if (start >= end) invalid();
    }
    if (end >= 128 && bytes.toString('ascii', end - 128, end - 125) === 'TAG')
        end -= 128;
    let offset = start,
        duration = 0,
        frames = 0;
    while (offset + 4 <= end) {
        const a = bytes[offset]!,
            b = bytes[offset + 1]!,
            c = bytes[offset + 2]!;
        const version = (b >> 3) & 3,
            layer = (b >> 1) & 3,
            bitIndex = c >> 4,
            rateIndex = (c >> 2) & 3;
        if (
            a !== 255 ||
            (b & 0xe0) !== 0xe0 ||
            version === 1 ||
            layer !== 1 ||
            bitIndex === 0 ||
            bitIndex === 15 ||
            rateIndex === 3
        )
            invalid();
        const bitrate =
            (version === 3
                ? [
                      0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224,
                      256, 320,
                  ]
                : [
                      0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144,
                      160,
                  ])[bitIndex]! * 1000;
        const rate =
            [44100, 48000, 32000][rateIndex]! /
            (version === 3 ? 1 : version === 2 ? 2 : 4);
        const size =
            Math.floor(((version === 3 ? 144 : 72) * bitrate) / rate) +
            ((c >> 1) & 1);
        if (size < 4 || offset + size > end) invalid();
        offset += size;
        duration += ((version === 3 ? 1152 : 576) / rate) * 1000;
        frames++;
        if (duration > 1_800_000) invalid();
    }
    if (!frames || offset !== end) invalid();
    return {
        bytes: bytes.subarray(start, end),
        mimeType: 'audio/mpeg',
        durationMs: Math.ceil(duration),
    };
}
