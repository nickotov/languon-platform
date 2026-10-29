import { z } from 'zod';
import {
    KnowledgeMediaAssetSchema,
    knowledgeAudioMaximumBytes,
} from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import { KnowledgeApiError } from './knowledge-api';
import type { KnowledgeMediaAccess } from '@languon/contracts';

/** Fetch authorized bytes; media players receive an ephemeral object URL, never a share key. */
export async function readKnowledgeAudio(
    noteId: string,
    assetId: string,
    options: {
        token?: string | undefined;
        access?: KnowledgeMediaAccess | undefined;
        signal: AbortSignal;
    },
): Promise<Blob> {
    z.uuid().parse(noteId);
    z.uuid().parse(assetId);
    const query = new URLSearchParams();
    if (options.access) {
        query.set('kind', options.access.kind);
        query.set('locator', options.access.locator);
    }
    const origin = resolveApiUrl(
        process.env.NODE_ENV,
        process.env.NEXT_PUBLIC_API_URL,
    );
    const response = await fetch(
        `${origin}/knowledge/notes/${noteId}/media/${assetId}?${query}`,
        {
            cache: 'no-store',
            credentials: 'include',
            signal: options.signal,
            headers: {
                ...(options.token
                    ? { Authorization: `Bearer ${options.token}` }
                    : {}),
                ...(options.access
                    ? { 'X-Languon-Share-Key': options.access.key }
                    : {}),
                Accept: 'audio/wav, audio/mpeg',
            },
        },
    );
    if (!response.ok)
        throw new KnowledgeApiError(response.status, {
            code: 'knowledge_not_found',
            message: 'Audio is unavailable.',
            correlationId: 'knowledge-audio-read',
        });
    const blob = await response.blob();
    if (
        !['audio/wav', 'audio/mpeg'].includes(blob.type) ||
        blob.size > knowledgeAudioMaximumBytes
    )
        throw new KnowledgeApiError(400, {
            code: 'invalid_request',
            message: 'Audio is unavailable.',
            correlationId: 'knowledge-audio-read',
        });
    return blob;
}

export async function uploadKnowledgeAudio(
    token: string,
    noteId: string,
    file: File,
) {
    z.uuid().parse(noteId);
    const mime =
        file.type === 'audio/x-wav'
            ? 'audio/wav'
            : file.type === 'audio/mp3'
              ? 'audio/mpeg'
              : file.type;
    if (
        !['audio/wav', 'audio/mpeg'].includes(mime) ||
        file.size === 0 ||
        file.size > knowledgeAudioMaximumBytes
    )
        throw new KnowledgeApiError(400, {
            code: 'invalid_request',
            message: 'Choose a WAV or MP3 audio file up to 5 MiB.',
            correlationId: 'knowledge-audio-upload',
        });
    const response = await fetch(
        `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/knowledge/notes/${noteId}/media`,
        {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': mime,
                Accept: 'application/json',
            },
            body: file,
            signal: AbortSignal.timeout(30_000),
        },
    );
    if (!response.ok)
        throw new KnowledgeApiError(response.status, {
            code: 'invalid_request',
            message: 'Audio upload failed.',
            correlationId: 'knowledge-audio-upload',
        });
    const { asset } = z
        .object({ asset: KnowledgeMediaAssetSchema })
        .parse(await response.json());
    return { assetId: asset.id };
}
