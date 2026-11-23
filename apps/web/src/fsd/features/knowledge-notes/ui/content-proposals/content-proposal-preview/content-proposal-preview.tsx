import type {
    KnowledgeContentProposal,
    LearningBlock,
} from '@languon/contracts';
import { LessonDocumentBlocks } from '../lesson-document-blocks/lesson-document-blocks';
import type { LearningBlockPlayback } from '@/fsd/entities/learning-blocks';
import { KnowledgeDocumentView } from '../../knowledge-document-view/knowledge-document-view';

/** The document renderer retains interleaved prose, safe marks and exercise groups. */
export function ContentProposalPreview({
    proposal,
    variant,
    playback,
    audioUrls,
}: {
    proposal: KnowledgeContentProposal;
    variant: 'compact' | 'review';
    playback?: LearningBlockPlayback | undefined;
    audioUrls?: Record<string, string> | undefined;
}) {
    function blockOptions(block: LearningBlock) {
        const audioUrl =
            block.type === 'audio' && block.assetId
                ? audioUrls?.[block.assetId]
                : undefined;

        return {
            variant,
            scope: `proposal-${proposal.id}-${variant}`,
            playback,
            audioUrl,
        };
    }

    if (
        proposal.body.document.content?.some(
            (node) =>
                node.attrs?.block?.type === 'exercise' &&
                node.attrs.block.semantics?.sources.some(
                    (source) => source.kind === 'audio',
                ),
        )
    ) {
        return (
            <LessonDocumentBlocks
                body={proposal.body}
                dependencies={proposal.dependencies}
                audioUrls={audioUrls}
                playback={playback}
            />
        );
    }

    return (
        <KnowledgeDocumentView
            body={proposal.body}
            dependencies={proposal.dependencies}
            blockOptions={blockOptions}
        />
    );
}
