import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import { BrowserApiError } from '@languon/browser-auth';
import {
    SpeechAvailabilityRequestSchema,
    SpeechAvailabilityResponseSchema,
    SpeechConfirmRequestSchema,
    SpeechPrepareRequestSchema,
    SpeechResponseSchema,
    type SpeechSource,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';

const apiUrl = resolveApiUrl(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_API_URL,
);

async function response(
    requestWithSession: RequestWithSession,
    path: string,
    signal: AbortSignal,
    body?: unknown,
) {
    return requestWithSession(async (token) => {
        const result = await fetch(`${apiUrl}/speech${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            credentials: 'include',
            cache: 'no-store',
            signal,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body === undefined
                    ? {}
                    : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!result.ok)
            throw new BrowserApiError(result.status, {
                code: 'speech_unavailable',
                message: 'Pronunciation is temporarily unavailable.',
                correlationId: 'speech-request',
            });
        return result;
    });
}

export function speechApi(requestWithSession: RequestWithSession) {
    return {
        async availability(sources: SpeechSource[], signal: AbortSignal) {
            const result = await response(
                requestWithSession,
                '/availability',
                signal,
                SpeechAvailabilityRequestSchema.parse({ sources }),
            );
            return SpeechAvailabilityResponseSchema.parse(await result.json());
        },
        async prepare(source: SpeechSource, signal: AbortSignal) {
            const result = await response(
                requestWithSession,
                '/prepare',
                signal,
                SpeechPrepareRequestSchema.parse({
                    source,
                    operationId: crypto.randomUUID(),
                }),
            );
            return SpeechResponseSchema.parse(await result.json());
        },
        async confirm(
            quoteId: string,
            operationId: string,
            signal: AbortSignal,
        ) {
            const result = await response(
                requestWithSession,
                '/confirm',
                signal,
                SpeechConfirmRequestSchema.parse({ quoteId, operationId }),
            );
            return SpeechResponseSchema.parse(await result.json());
        },
        async status(requestId: string, signal: AbortSignal) {
            const result = await response(
                requestWithSession,
                `/requests/${encodeURIComponent(requestId)}`,
                signal,
            );
            return SpeechResponseSchema.parse(await result.json());
        },
        async bytes(playbackId: string, signal: AbortSignal) {
            const result = await response(
                requestWithSession,
                `/playbacks/${encodeURIComponent(playbackId)}/content`,
                signal,
            );
            const blob = await result.blob();
            if (
                ![
                    'audio/mpeg',
                    'audio/wav',
                    'audio/x-wav',
                    'audio/ogg',
                    'audio/mp4',
                ].includes(blob.type) ||
                blob.size > 5 * 1024 * 1024 ||
                blob.size === 0
            )
                throw new Error('Invalid pronunciation audio');
            return blob;
        },
    };
}

export type SpeechTransport = ReturnType<typeof speechApi>;
