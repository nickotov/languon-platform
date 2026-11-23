import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { SpeechError } from '../../domain/speech-policy';
import { LearningTranscriptSchema } from '@languon/contracts';
import type { AudioBytes } from '../../domain/audio-bytes';
import {
    assertAudioIntegrity,
    audioChecksum,
} from '../../domain/audio-integrity';

const sampleRate = 16_000;
const bytesPerSecond = sampleRate * 2;
const maximumPcmBytes = bytesPerSecond * 120;
const turnPause = Buffer.alloc(bytesPerSecond / 4);

let decoderChecked = false;

// The media decoder only consumes pipes and never needs API or database credentials.
const decoderProcess = {
    cwd: '/',
    env: { PATH: process.env.PATH, LANG: 'C' },
};

// Production uses exactly the same confinement for readiness and for actual decoding.
function decoderCommand(args: string[]) {
    if (process.env.NODE_ENV !== 'production') {
        return { executable: 'ffmpeg', args };
    }

    return {
        executable: '/usr/bin/prlimit',
        args: [
            '--cpu=12',
            '--as=1073741824',
            '--fsize=0',
            '--nproc=64',
            '--',
            '/usr/bin/bwrap',
            '--die-with-parent',
            '--new-session',
            '--unshare-all',
            '--clearenv',
            '--ro-bind',
            '/usr',
            '/usr',
            '--ro-bind-try',
            '/lib',
            '/lib',
            '--ro-bind-try',
            '/lib64',
            '/lib64',
            '--dev',
            '/dev',
            '--tmpfs',
            '/tmp',
            '--chdir',
            '/tmp',
            '/usr/bin/ffmpeg',
            ...args,
        ],
    };
}

export async function checkListeningDecoder(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (decoderChecked) {
        return;
    }

    try {
        const command = decoderCommand(['-version']);
        await promisify(execFile)(command.executable, command.args, {
            ...decoderProcess,
            timeout: 5000,
            signal,
        });

        decoderChecked = true;
    } catch {
        signal?.throwIfAborted();

        throw new SpeechError('speech_decoder_unavailable', 503);
    }
}

async function decode(audio: AudioBytes, limit: number, signal?: AbortSignal) {
    assertAudioIntegrity(audio);
    signal?.throwIfAborted();
    // Fix the demuxer and protocol. Provider bytes can never select a path, URL or playlist.
    const command = decoderCommand([
        '-nostdin',
        '-max_alloc',
        '33554432',
        '-hide_banner',
        '-loglevel',
        'error',
        '-protocol_whitelist',
        'pipe',
        '-f',
        audio.mimeType === 'audio/wav' ? 'wav' : 'mp3',
        '-i',
        'pipe:0',
        '-map',
        '0:a:0',
        '-threads',
        '1',
        '-ac',
        '1',
        '-ar',
        String(sampleRate),
        '-f',
        's16le',
        'pipe:1',
    ]);
    const child = spawn(command.executable, command.args, {
        ...decoderProcess,
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 15_000,
        killSignal: 'SIGKILL',
        ...(signal ? { signal } : {}),
    });

    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        child.once('error', reject);
        child.stdin.on('error', () => {
            /* Decoder exit determines the result. */
        });

        child.stdout.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limit) {
                child.kill('SIGKILL');
            } else {
                chunks.push(chunk);
            }
        });

        child.once('close', (code) => {
            if (code !== 0 || size === 0 || size % 2 || size > limit) {
                reject(
                    new Error(
                        'Unable to decode a bounded listening utterance.',
                    ),
                );
            } else {
                resolve(Buffer.concat(chunks, size));
            }
        });

        child.stdin.end(audio.bytes);
    });
}

function wav(pcm: Buffer) {
    const header = Buffer.alloc(44);
    header.write('RIFF');
    header.writeUInt32LE(pcm.length + 36, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(bytesPerSecond, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);

    return Buffer.concat([header, pcm]);
}

export async function assembleListeningRecording(input: {
    language: string;
    utterances: readonly {
        id: string;
        speaker: string;
        text: string;
        audio: AudioBytes;
    }[];
    signal?: AbortSignal;
}) {
    const chunks: Buffer[] = [];
    const segments = [];
    let length = 0;
    for (const utterance of input.utterances) {
        if (segments.length) {
            chunks.push(turnPause);
            length += turnPause.length;
        }

        const pcm = await decode(
            utterance.audio,
            maximumPcmBytes - length,
            input.signal,
        );
        const startSeconds = length / bytesPerSecond;
        chunks.push(pcm);
        length += pcm.length;
        segments.push({
            id: utterance.id,
            speaker: utterance.speaker,
            text: utterance.text,
            timing: { startSeconds, endSeconds: length / bytesPerSecond },
        });
    }

    const transcript = LearningTranscriptSchema.parse({
        language: input.language,
        segments,
    });
    const bytes = wav(Buffer.concat(chunks, length));
    const audio: AudioBytes = {
        bytes,
        mimeType: 'audio/wav',
        checksum: audioChecksum(bytes),
        durationMs: Math.round((1000 * length) / bytesPerSecond),
    };

    assertAudioIntegrity(audio);

    return { audio, transcript };
}
