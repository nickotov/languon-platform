import type {
    KnowledgeContentProposal,
    LearningBlock,
} from '@languon/contracts';
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

    return (
        <KnowledgeDocumentView
            body={proposal.body}
            dependencies={proposal.dependencies}
            blockOptions={blockOptions}
        />
    );
}
