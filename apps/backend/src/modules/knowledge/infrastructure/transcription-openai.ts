import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
    AssistantLanguageSchema,
    KnowledgeTranscriptionDispatchPermitSchema,
    KnowledgeTranscriptionRequestSchema,
    KnowledgeTranscriptionResultSchema,
    type KnowledgeTranscriptionRequest,
} from '@languon/contracts';
import type {
    TranscriptionAdmissionAuthority,
    KnowledgeTranscriptionProvider,
} from '../application/transcription-provider';
import type { VerifiedKnowledgeAudio } from '../application/media-store';
import { isApprovedTranscriptionProcessingRevision } from '../domain/transcription-processing-policy';
import { KNOWLEDGE_TRANSCRIPTION_MODEL } from '../domain/transcription-model';
import { transcriptionCredentialFingerprint } from './transcription-credential-fingerprint';
import { verifyKnowledgeAudio } from './media-audio-validation';

/** Official references checked 2026-10-28: model/gpt-transcribe + guides/speech-to-text + audio/transcriptions create API. */
const endpoint = KNOWLEDGE_TRANSCRIPTION_MODEL.endpoint;
const responseSchema = z.object({
    text: z.string(),
    languages: z.array(z.object({ code: AssistantLanguageSchema })).max(16),
    usage: z
        .object({
            type: z.literal('duration'),
            seconds: z.number().finite().nonnegative(),
        })
        .optional(),
});
export class KnowledgeTranscriptionError extends Error {
    constructor(
        readonly code:
            | 'not_ready'
            | 'invalid_audio'
            | 'provider_unavailable'
            | 'invalid_response',
        message: string,
    ) {
        super(message);
        this.name = 'KnowledgeTranscriptionError';
    }
}
async function boundedJson(
    response: Response,
    signal: AbortSignal,
): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader)
        throw new KnowledgeTranscriptionError(
            'invalid_response',
            'The transcription response is unavailable.',
        );
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        for (;;) {
            signal.throwIfAborted();
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.length;
            if (bytes > 512_000) {
                await reader.cancel();
                throw new KnowledgeTranscriptionError(
                    'invalid_response',
                    'The transcription response exceeds its limit.',
                );
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new KnowledgeTranscriptionError(
            'invalid_response',
            'The transcription response is invalid.',
        );
    }
}

/** Fixed transport requires canonical source/accounting and code-owned processing approval. No retries. */
export class OpenAiKnowledgeTranscriptionProvider implements KnowledgeTranscriptionProvider {
    private readonly fetch: typeof globalThis.fetch;
    constructor(
        private readonly options: {
            apiKey: string;
            authority: TranscriptionAdmissionAuthority;
            fetch?: typeof globalThis.fetch;
            timeoutMs?: number;
        },
    ) {
        this.fetch = options.fetch ?? globalThis.fetch;
        if (
            !options.apiKey ||
            options.apiKey.length > 4096 ||
            /\s/u.test(options.apiKey)
        )
            throw new KnowledgeTranscriptionError(
                'not_ready',
                'Transcription credentials are unavailable.',
            );
        if (
            options.timeoutMs !== undefined &&
            (!Number.isInteger(options.timeoutMs) ||
                options.timeoutMs < 1 ||
                options.timeoutMs > 120_000)
        )
            throw new KnowledgeTranscriptionError(
                'not_ready',
                'The transcription timeout is invalid.',
            );
    }
    async transcribe(
        input: KnowledgeTranscriptionRequest & {
            audio: VerifiedKnowledgeAudio;
            signal: AbortSignal;
        },
    ) {
        input.signal.throwIfAborted();
        const request = KnowledgeTranscriptionRequestSchema.parse({
            operationId: input.operationId,
            noteId: input.noteId,
            assetId: input.assetId,
            languages: input.languages,
        });
        const audio = verifyKnowledgeAudio(
            input.audio.bytes,
            input.audio.mimeType,
        );
        if (
            audio.durationMs !== input.audio.durationMs ||
            !Buffer.from(audio.bytes).equals(Buffer.from(input.audio.bytes))
        )
            throw new KnowledgeTranscriptionError(
                'invalid_audio',
                'The immutable audio content does not match its verified metadata.',
            );
        const checksum = createHash('sha256').update(audio.bytes).digest('hex');
        const permit = KnowledgeTranscriptionDispatchPermitSchema.parse(
            await this.options.authority.authorizeDispatch({
                ...request,
                checksum,
                byteLength: audio.bytes.length,
                durationMs: audio.durationMs,
                signal: input.signal,
            }),
        );
        if (
            !isApprovedTranscriptionProcessingRevision(
                permit.processingControlsRevision,
            ) ||
            permit.processingCredentialFingerprint !==
                transcriptionCredentialFingerprint(this.options.apiKey) ||
            permit.operationId !== request.operationId ||
            permit.noteId !== request.noteId ||
            permit.assetId !== request.assetId ||
            permit.checksum !== checksum ||
            permit.maximumBytes < audio.bytes.length ||
            permit.maximumDurationMs < audio.durationMs ||
            Date.parse(permit.expiresAt) <= Date.now()
        )
            throw new KnowledgeTranscriptionError(
                'not_ready',
                'The transcription dispatch receipt is unavailable or stale.',
            );
        input.signal.throwIfAborted();
        const form = new FormData();
        form.set('model', KNOWLEDGE_TRANSCRIPTION_MODEL.modelId);
        const filename =
            audio.mimeType === 'audio/wav' ? 'audio.wav' : 'audio.mp3';
        form.set(
            'file',
            new Blob([new Uint8Array(audio.bytes).buffer], {
                type: audio.mimeType,
            }),
            filename,
        );
        for (const language of request.languages)
            form.append('languages[]', language);
        const signal = AbortSignal.any([
            input.signal,
            AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
        ]);
        let response: Response;
        try {
            response = await this.fetch(endpoint, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.options.apiKey}` },
                body: form,
                signal,
                redirect: 'error',
            });
        } catch {
            if (signal.aborted) throw signal.reason;
            throw new KnowledgeTranscriptionError(
                'provider_unavailable',
                'Transcription is temporarily unavailable.',
            );
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new KnowledgeTranscriptionError(
                'provider_unavailable',
                'Transcription is temporarily unavailable.',
            );
        }
        const decoded = responseSchema.safeParse(
            await boundedJson(response, signal),
        );
        if (!decoded.success)
            throw new KnowledgeTranscriptionError(
                'invalid_response',
                'The transcription response is invalid.',
            );
        signal.throwIfAborted();
        return KnowledgeTranscriptionResultSchema.parse({
            receiptId: permit.receiptId,
            text: decoded.data.text,
            languages: decoded.data.languages.map((item) => item.code),
            usage: decoded.data.usage ?? null,
        });
    }
}
