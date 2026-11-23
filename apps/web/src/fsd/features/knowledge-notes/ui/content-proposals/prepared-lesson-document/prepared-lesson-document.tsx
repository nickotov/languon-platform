'use client';
import {
    useKnowledgeAudioUrls,
    type KnowledgeAudioUrlsOptions,
} from '@/fsd/entities/knowledge';
import type { KnowledgeBody, LearningBlock } from '@languon/contracts';
import { LessonDocumentBlocks } from '../lesson-document-blocks/lesson-document-blocks';
import { listeningSourceBlocks } from '../../../lib/listening-source-blocks';
/** Resolve media only while a prepared part is open; URLs stay scoped to the owner's note. */
export function PreparedLessonDocument({
    body,
    dependencies,
    noteId,
    actorId,
    requestWithSession,
}: {
    body: KnowledgeBody;
    dependencies?: LearningBlock[] | undefined;
} & Pick<
    KnowledgeAudioUrlsOptions,
    'noteId' | 'actorId' | 'requestWithSession'
>) {
    const blocks = [
        ...(body.document.content?.flatMap((node) => node.attrs?.block ?? []) ??
            []),
        ...listeningSourceBlocks(body, dependencies),
    ];
    const assetIds = blocks.flatMap((block) =>
        block.type === 'audio' && block.assetId ? [block.assetId] : [],
    );
    const urls = useKnowledgeAudioUrls({
        noteId,
        actorId,
        requestWithSession,
        assetIds,
        unavailable: false,
        access: undefined,
    });

    return (
        <LessonDocumentBlocks
            body={body}
            dependencies={dependencies}
            audioUrls={urls}
        />
    );
}
