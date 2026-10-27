import {
    SpeechSubmissionError,
    SpeechTaskFailedError,
    type SpeechProfile,
    type SpeechSynthesisProvider,
    type SpeechSynthesisResult,
} from '../../application/ports/speech-synthesis-provider';
import {
    assertAudioIntegrity,
    audioChecksum,
    maximumAudioBytes,
} from '../../domain/audio-integrity';
import {
    findSpeechModel,
    OPENROUTER_ELEVEN_TURBO_MODEL,
} from '../../domain/speech-models';
import { validateMp3 } from './safe-audio-download';
import { findConfiguredSpeechProfile } from './speech-providers';

export interface OpenRouterSpeechProviderOptions {
    configurationId: string;
    apiKey: string;
    profiles: Readonly<Record<string, SpeechProfile>>;
    timeoutMs: number;
    fetch?: typeof fetch;
}

/** Bound both HTTP dispatch and body reads, including a stalled response stream. */
async function withAbort<T>(
    operation: Promise<T>,
    signal: AbortSignal,
): Promise<T> {
    let onAbort: () => void = () => {};
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_resolve, reject) => {
                onAbort = () => reject(new Error('Speech request aborted.'));
                if (signal.aborted) onAbort();
                else signal.addEventListener('abort', onAbort, { once: true });
            }),
        ]);
    } finally {
        signal.removeEventListener('abort', onAbort);
    }
}

export class OpenRouterSpeechProvider implements SpeechSynthesisProvider {
    readonly configurationId: string;
    private readonly profiles: Readonly<Record<string, SpeechProfile>>;

    constructor(private readonly options: OpenRouterSpeechProviderOptions) {
        if (
            !options.configurationId.trim() ||
            !options.apiKey.trim() ||
            !Number.isInteger(options.timeoutMs) ||
            options.timeoutMs <= 0 ||
            options.timeoutMs > 45000
        )
            throw new Error('Invalid speech provider configuration.');
        this.configurationId = options.configurationId;
        this.profiles = Object.freeze(
            Object.fromEntries(
                Object.entries(options.profiles).map(([key, profile]) => [
                    key,
                    Object.freeze({ ...profile }),
                ]),
            ),
        );
    }

    supports(language: string): SpeechProfile | null {
        const profile = findConfiguredSpeechProfile(this.profiles, language);
        if (!profile) return null;
        try {
            this.assertProfile(profile);
            return profile;
        } catch {
            return null;
        }
    }

    private assertProfile(profile: SpeechProfile) {
        const model = findSpeechModel('openrouter', profile.model);
        const configured = Object.values(this.profiles).some(
            (candidate) =>
                candidate.configurationId === profile.configurationId &&
                candidate.provider === profile.provider &&
                candidate.model === profile.model &&
                candidate.voice === profile.voice &&
                candidate.language === profile.language &&
                candidate.settingsVersion === profile.settingsVersion &&
                candidate.estimatedCostUnitsPerCharacter ===
                    profile.estimatedCostUnitsPerCharacter,
        );
        if (
            profile.configurationId !== this.configurationId ||
            profile.provider !== 'openrouter' ||
            profile.model !== OPENROUTER_ELEVEN_TURBO_MODEL ||
            !configured ||
            !model ||
            !Object.values(model.languageCodes).includes(profile.language) ||
            !model.voices?.includes(profile.voice) ||
            !model.settingsVersions?.includes(profile.settingsVersion)
        )
            throw new Error('Unsupported speech configuration.');
        return model;
    }

    async submit(
        input: Parameters<SpeechSynthesisProvider['submit']>[0],
    ): Promise<SpeechSynthesisResult> {
        try {
            const model = this.assertProfile(input.profile);
            if (
                !input.text.trim() ||
                // Eleven v4 treats arbitrary square-bracket tags as audio instructions.
                // Saved/shared content must never supply that instruction channel.
                /\[[\s\S]*\]/u.test(input.text) ||
                Array.from(input.text).length >
                    Math.min(2000, model.maxCharacters)
            )
                throw new Error('Invalid speech input.');
            input.signal?.throwIfAborted();
        } catch {
            throw new SpeechSubmissionError('not_submitted', false);
        }

        const signal = AbortSignal.any([
            AbortSignal.timeout(this.options.timeoutMs),
            ...(input.signal ? [input.signal] : []),
        ]);
        try {
            const response = await withAbort(
                (this.options.fetch ?? fetch)(
                    'https://openrouter.ai/api/v1/audio/speech',
                    {
                        method: 'POST',
                        redirect: 'error',
                        headers: {
                            authorization: `Bearer ${this.options.apiKey}`,
                            'content-type': 'application/json',
                            accept: 'audio/mpeg',
                        },
                        body: JSON.stringify({
                            model: input.profile.model,
                            input: input.text,
                            voice: input.profile.voice,
                            response_format: 'mp3',
                            provider: {
                                zdr: true,
                                data_collection: 'deny',
                                options: {
                                    elevenlabs: {
                                        language_code: input.profile.language,
                                    },
                                },
                            },
                        }),
                        signal,
                    },
                ),
                signal,
            );
            if (
                [400, 401, 402, 403, 404, 405, 413, 415, 422, 429].includes(
                    response.status,
                )
            ) {
                void response.body?.cancel().catch(() => {});
                throw new SpeechSubmissionError('not_submitted', false);
            }
            if (
                response.status !== 200 ||
                response.headers.get('content-type')?.split(';')[0]?.trim() !==
                    'audio/mpeg' ||
                Number(response.headers.get('content-length') ?? 0) >
                    maximumAudioBytes
            ) {
                void response.body?.cancel().catch(() => {});
                throw new SpeechSubmissionError('unknown', false);
            }
            const reader = response.body?.getReader();
            if (!reader) throw new Error('Missing speech audio.');
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                while (true) {
                    const next = await withAbort(reader.read(), signal);
                    if (next.done) break;
                    size += next.value.length;
                    if (size > maximumAudioBytes)
                        throw new Error('Speech audio exceeds limit.');
                    chunks.push(next.value);
                }
            } finally {
                void reader.cancel().catch(() => {});
            }
            signal.throwIfAborted();
            const bytes = Buffer.concat(chunks, size);
            const audio = {
                bytes,
                mimeType: 'audio/mpeg' as const,
                durationMs: validateMp3(bytes),
                checksum: audioChecksum(bytes),
            };
            assertAudioIntegrity(audio);
            return { state: 'ready', audio };
        } catch (error) {
            if (error instanceof SpeechSubmissionError) throw error;
            // Accepted paid work cannot be safely resubmitted after an ambiguous failure.
            throw new SpeechSubmissionError('unknown', false);
        }
    }

    async poll(): Promise<SpeechSynthesisResult> {
        throw new SpeechTaskFailedError();
    }
}
