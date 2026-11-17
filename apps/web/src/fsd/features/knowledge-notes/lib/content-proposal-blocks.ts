import type { KnowledgeContentProposal } from '@languon/contracts';

/** Custom blocks are a projection; prose and its position stay in the proposal body. */
export function contentProposalBlocks(proposal: KnowledgeContentProposal) {
    return (
        proposal.body.document.content?.flatMap((node) =>
            node.type === 'learningBlock' && node.attrs?.block
                ? [node.attrs.block]
                : [],
        ) ?? []
    );
}
