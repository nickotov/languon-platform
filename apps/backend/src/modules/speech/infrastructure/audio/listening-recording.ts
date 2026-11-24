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
const maximumDurationSeconds = 120;
// Keep dialogue intelligible, including for learners. Longer scripts need a fresh, shorter draft.
const maximumTempo = 1.15;
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

async function decode(
    audio: AudioBytes,
    limit: number,
    signal?: AbortSignal,
    tempo = 1,
) {
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
        ...(tempo === 1 ? [] : ['-af', 'atempo=' + tempo.toFixed(6)]),
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
            if (size > limit) {
                reject(new SpeechError('speech_duration_exceeded'));
            } else if (code !== 0 || size === 0 || size % 2) {
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

interface ListeningClip {
    id: string;
    speaker: string;
    text: string;
    audio: AudioBytes;
}

async function decodeClips(
    utterances: readonly ListeningClip[],
    byteLimit: number,
    tempo: number,
    signal?: AbortSignal,
) {
    const clips: Buffer[] = [];
    let length = 0;
    for (const utterance of utterances) {
        const clip = await decode(
            utterance.audio,
            byteLimit - length,
            signal,
            tempo,
        );

        clips.push(clip);
        length += clip.length;
    }

    return { clips, length };
}

export async function assembleListeningRecording(input: {
    language: string;
    utterances: readonly ListeningClip[];
    maxDurationSeconds?: number;
    signal?: AbortSignal;
}) {
    const seconds = input.maxDurationSeconds ?? maximumDurationSeconds;
    if (
        !Number.isInteger(seconds) ||
        seconds < 1 ||
        seconds > maximumDurationSeconds
    ) {
        throw new SpeechError('speech_duration_invalid');
    }

    const pauseBytes =
        Math.max(0, input.utterances.length - 1) * turnPause.length;
    const voicedLimit = seconds * bytesPerSecond - pauseBytes;
    if (voicedLimit <= 0) {
        throw new SpeechError('speech_duration_exceeded');
    }

    // Count actual samples including the pauses. Provider-reported durations are estimates.
    const natural = await decodeClips(
        input.utterances,
        input.maxDurationSeconds === undefined
            ? voicedLimit
            : Math.ceil(voicedLimit * maximumTempo),
        1,
        input.signal,
    );
    let clips = natural.clips;
    if (natural.length > voicedLimit) {
        // atempo preserves pitch. Small headroom covers filter frame rounding across clips.
        const tempo = Math.min(
            maximumTempo,
            (natural.length / voicedLimit) * 1.005,
        );

        clips = (
            await decodeClips(
                input.utterances,
                voicedLimit,
                tempo,
                input.signal,
            )
        ).clips;
    }

    const chunks: Buffer[] = [];
    const segments = [];
    let length = 0;
    for (const [index, utterance] of input.utterances.entries()) {
        if (segments.length) {
            chunks.push(turnPause);
            length += turnPause.length;
        }

        const pcm = clips[index]!;
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
