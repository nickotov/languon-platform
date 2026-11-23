'use client';

import { useId, useMemo } from 'react';
import type { KnowledgeBody, LearningBlock } from '@languon/contracts';
import { validateKnowledgeFragment } from '@/fsd/entities/knowledge';
import {
    exerciseSource,
    type LearningBlockPlayback,
} from '@/fsd/entities/learning-blocks';
import { KnowledgeEditor } from '../../knowledge-editor/knowledge-editor';

import { listeningSourceBlocks } from '../../../lib/listening-source-blocks';
/** Each generated part owns a read-only document editor and local disclosures. */
export function LessonDocumentBlocks({
    body,
    dependencies,
    playback,
    audioUrls,
}: {
    body: KnowledgeBody;
    dependencies?: LearningBlock[] | undefined;
    audioUrls?: Record<string, string> | undefined;
    playback?: LearningBlockPlayback | undefined;
}) {
    const scope = useId();
    const fragment = useMemo(() => {
        const sources = listeningSourceBlocks(body, dependencies);
        if (!sources.length) {
            return validateKnowledgeFragment(body, dependencies);
        }

        // Show an existing recording once above its questions, without modifying the proposal.
        return validateKnowledgeFragment(
            {
                ...body,
                document: {
                    ...body.document,
                    content: [
                        ...sources.map((block) => ({
                            type: 'learningBlock' as const,
                            attrs: { block },
                        })),
                        ...(body.document.content ?? []),
                    ],
                },
            },
            dependencies?.filter(
                (block) => !sources.some((source) => source.id === block.id),
            ),
        );
    }, [body, dependencies]);

    function blockViewOptions(block: LearningBlock) {
        const source = exerciseSource(block, fragment, dependencies);
        const assetId =
            block.type === 'audio' ? block.assetId : source.audioAssetId;

        return {
            scope: `${scope}-${block.id}`,
            disclosureOnly: true,
            playback,
            audioUrl: assetId ? audioUrls?.[assetId] : undefined,
            hintTranscript: source.transcript,
            hintVideoSource: source.videoSource,
        };
    }

    return <KnowledgeEditor value={fragment} preview={{ blockViewOptions }} />;
}
