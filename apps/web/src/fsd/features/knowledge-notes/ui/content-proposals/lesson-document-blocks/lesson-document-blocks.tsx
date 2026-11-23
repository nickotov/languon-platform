'use client';

import { useId, useMemo } from 'react';
import type { KnowledgeBody, LearningBlock } from '@languon/contracts';
import { validateKnowledgeFragment } from '@/fsd/entities/knowledge';
import {
    exerciseSource,
    type LearningBlockPlayback,
} from '@/fsd/entities/learning-blocks';
import { KnowledgeEditor } from '../../knowledge-editor/knowledge-editor';

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
    const fragment = useMemo(
        () => validateKnowledgeFragment(body, dependencies),
        [body, dependencies],
    );

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
