import type {
    KnowledgeContentProposal,
    KnowledgeNode,
} from '@languon/contracts';

export function contentProposalExcerpt(
    proposal: KnowledgeContentProposal,
): string {
    function text(node: KnowledgeNode): string {
        if (node.type === 'learningBlock') {
            return '';
        }

        return node.text ?? node.content?.map(text).join(' ') ?? '';
    }

    const prose = text(proposal.body.document).replace(/\s+/gu, ' ').trim();

    return prose.length > 240 ? `${prose.slice(0, 240)}…` : prose;
}
