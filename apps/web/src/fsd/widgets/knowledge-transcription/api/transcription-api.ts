import { z } from 'zod';
import {
    KnowledgeTranscriptionJobResponseSchema,
    SubmitKnowledgeTranscriptionRequestSchema,
    type SubmitKnowledgeTranscriptionRequest,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';
export class TranscriptionApiError extends Error {
    constructor(readonly status: number) {
        super('Transcription is unavailable.');
    }
}
export function transcriptionApi(
    request: RequestWithSession,
    expectedAssetId: string,
) {
    z.uuid().parse(expectedAssetId);
    async function call(
        noteId: string,
        operationId: string,
        method: 'GET' | 'POST',
        suffix: string,
        input?: SubmitKnowledgeTranscriptionRequest,
        signal?: AbortSignal,
    ) {
        z.uuid().parse(noteId);
        z.uuid().parse(operationId);
        return request(async (token) => {
            const response = await fetch(
                `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/knowledge/${noteId}/transcriptions${suffix}`,
                {
                    method,
                    credentials: 'include',
                    cache: 'no-store',
                    ...(signal ? { signal } : {}),
                    headers: {
                        Authorization: `Bearer ${token}`,
                        ...(input
                            ? { 'Content-Type': 'application/json' }
                            : {}),
                    },
                    ...(input
                        ? {
                              body: JSON.stringify(
                                  SubmitKnowledgeTranscriptionRequestSchema.parse(
                                      input,
                                  ),
                              ),
                          }
                        : {}),
                },
            );
            if (!response.ok) throw new TranscriptionApiError(response.status);
            const { job } = KnowledgeTranscriptionJobResponseSchema.parse(
                await response.json(),
            );
            if (
                job.id !== operationId ||
                job.noteId !== noteId ||
                job.assetId !== expectedAssetId ||
                (job.state === 'completed' && job.result === null)
            )
                throw new TranscriptionApiError(400);
            return job;
        });
    }
    return {
        submit: (
            input: SubmitKnowledgeTranscriptionRequest,
            signal: AbortSignal,
        ) => call(input.noteId, input.operationId, 'POST', '', input, signal),
        read: (noteId: string, operationId: string, signal: AbortSignal) =>
            call(
                noteId,
                operationId,
                'GET',
                `/${operationId}`,
                undefined,
                signal,
            ),
        cancel: (noteId: string, operationId: string, signal: AbortSignal) =>
            call(
                noteId,
                operationId,
                'POST',
                `/${operationId}/cancel`,
                undefined,
                signal,
            ),
    };
}
