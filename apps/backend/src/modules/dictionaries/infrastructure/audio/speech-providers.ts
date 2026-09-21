import { z } from 'zod';

import {
    SpeechSubmissionError,
    SpeechTaskFailedError,
    type SpeechProfile,
    type SpeechSynthesisProvider,
    type SpeechSynthesisResult,
} from '../../application/ports/speech-synthesis-provider';
import { createFixtureAudio } from './audio-integrity';
import { downloadAudioResult } from './safe-audio-download';

export class FixtureSpeechProvider implements SpeechSynthesisProvider {
    public readonly configurationId = 'fixture-v1';
    supports(language: string): SpeechProfile {
        return {
            configurationId: this.configurationId,
            provider: 'fixture',
            model: 'tone-v1',
            voice: 'fixture',
            language,
            settingsVersion: '1',
            estimatedCostUnitsPerCharacter: 0,
        };
    }
    async submit(
        input: Parameters<SpeechSynthesisProvider['submit']>[0],
    ): Promise<SpeechSynthesisResult> {
        input.signal?.throwIfAborted();
        return { state: 'ready', audio: createFixtureAudio() };
    }
    async poll(): Promise<SpeechSynthesisResult> {
        throw new Error('Fixture tasks are synchronous.');
    }
}

const envelopeSchema = z.object({
    code: z.number().int(),
    data: z.unknown().optional(),
});
const taskSchema = z.object({ taskId: z.string().min(1).max(256) });
const statusSchema = taskSchema.extend({
    model: z.string(),
    state: z.enum(['waiting', 'queuing', 'generating', 'success', 'fail']),
    resultJson: z.string().max(16384).nullable().optional(),
});
const resultSchema = z.object({
    resultUrls: z.array(z.string().url().max(4096)).length(1),
});

export interface KieSpeechProviderOptions {
    configurationId: string;
    apiKey: string;
    profiles: Readonly<Record<string, SpeechProfile>>;
    allowedDownloadHosts: readonly string[];
    fetch?: typeof fetch;
    download?: typeof downloadAudioResult;
}

export class KieSpeechProvider implements SpeechSynthesisProvider {
    readonly configurationId: string;
    constructor(private readonly options: KieSpeechProviderOptions) {
        this.configurationId = options.configurationId;
    }
    supports(language: string): SpeechProfile | null {
        return this.options.profiles[language] ?? null;
    }
    private assertProfile(profile: SpeechProfile) {
        if (
            profile.configurationId !== this.configurationId ||
            profile.provider !== 'kie' ||
            profile.model !== 'elevenlabs/text-to-speech-turbo-2-5'
        )
            throw new Error('Unsupported speech configuration.');
    }
    private async request(
        path: string,
        signal: AbortSignal | undefined,
        body?: unknown,
    ) {
        const response = await (this.options.fetch ?? fetch)(
            `https://api.kie.ai/api/v1/jobs/${path}`,
            {
                method: body ? 'POST' : 'GET',
                redirect: 'error',
                headers: {
                    authorization: `Bearer ${this.options.apiKey}`,
                    'content-type': 'application/json',
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
                signal: AbortSignal.any([
                    AbortSignal.timeout(15000),
                    ...(signal ? [signal] : []),
                ]),
            },
        );
        // Read a bounded response instead of trusting JSON/text helpers with arbitrary bodies.
        const reader = response.body?.getReader();
        let size = 0;
        const chunks: Uint8Array[] = [];
        if (reader)
            try {
                while (true) {
                    const next = await reader.read();
                    if (next.done) break;
                    size += next.value.length;
                    if (size > 65536)
                        throw new Error('Invalid provider response.');
                    chunks.push(next.value);
                }
            } finally {
                await reader.cancel();
            }
        const parsed = envelopeSchema.parse(
            JSON.parse(Buffer.concat(chunks).toString('utf8')),
        );
        return { status: response.status, ...parsed };
    }
    async submit(
        input: Parameters<SpeechSynthesisProvider['submit']>[0],
    ): Promise<SpeechSynthesisResult> {
        try {
            this.assertProfile(input.profile);
            if (
                !input.text.trim() ||
                input.text.length > 5000 ||
                Array.from(input.text).length > 2000
            )
                throw new Error('Invalid input.');
            input.signal?.throwIfAborted();
        } catch {
            throw new SpeechSubmissionError('not_submitted', false);
        }
        try {
            const result = await this.request('createTask', input.signal, {
                model: input.profile.model,
                input: {
                    text: input.text,
                    voice: input.profile.voice,
                    language_code: input.profile.language,
                    speed: 1,
                    timestamps: false,
                },
            });
            if (
                [400, 401, 402, 404, 422, 429, 433, 455, 505].includes(
                    result.code,
                ) &&
                result.status < 500
            )
                throw new SpeechSubmissionError(
                    'not_submitted',
                    [429, 455].includes(result.code),
                );
            if (result.status !== 200 || result.code !== 200)
                throw new SpeechSubmissionError('unknown', false);
            return {
                state: 'pending',
                taskId: taskSchema.parse(result.data).taskId,
                retryAfterMs: 2500,
            };
        } catch (error) {
            if (error instanceof SpeechSubmissionError) throw error;
            // A timeout/malformed success could have followed accepted paid work.
            throw new SpeechSubmissionError('unknown', false);
        }
    }
    async poll(
        input: Parameters<SpeechSynthesisProvider['poll']>[0],
    ): Promise<SpeechSynthesisResult> {
        this.assertProfile(input.profile);
        const result = await this.request(
            `recordInfo?taskId=${encodeURIComponent(input.taskId)}`,
            input.signal,
        );
        if (result.status !== 200 || result.code !== 200)
            throw new Error('Speech task status unavailable.');
        const data = statusSchema.parse(result.data);
        if (data.taskId !== input.taskId || data.model !== input.profile.model)
            throw new Error('Mismatched speech task.');
        if (data.state === 'fail') throw new SpeechTaskFailedError();
        if (data.state !== 'success')
            return {
                state: 'pending',
                taskId: input.taskId,
                retryAfterMs: 2500,
            };
        const urls = resultSchema.parse(
            JSON.parse(data.resultJson ?? ''),
        ).resultUrls;
        return {
            state: 'ready',
            audio: await (this.options.download ?? downloadAudioResult)(
                urls[0]!,
                this.options.allowedDownloadHosts,
                input.signal,
            ),
        };
    }
}
