import { z } from 'zod';
import {
    AssistantLanguageSchema,
    KnowledgeMediaAssetSchema,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

const appliedSchema = z
    .object({
        asset: KnowledgeMediaAssetSchema,
        sourceText: z.string().max(80000),
        language: AssistantLanguageSchema,
    })
    .strict();
export async function applyNarration(
    request: RequestWithSession,
    noteId: string,
    playbackId: string,
    signal: AbortSignal,
) {
    return request(async (token) => {
        const response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/knowledge/notes/${encodeURIComponent(noteId)}/media/from-speech`,
            {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                signal,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ playbackId }),
            },
        );
        if (!response.ok) throw new Error('Unable to apply narration.');
        return appliedSchema.parse(await response.json());
    });
}
