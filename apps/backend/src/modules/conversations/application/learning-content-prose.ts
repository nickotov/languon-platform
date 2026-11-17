import type { KnowledgeBody } from '@languon/contracts';

/** Stable learner-visible projection: marks do not insert separators within a paragraph. */
export function learningContentProseText(body: KnowledgeBody): string {
    const text = (node: KnowledgeBody['document']): string => {
        if (node.type === 'text') {
            return node.text ?? '';
        }

        if (node.type === 'hardBreak') {
            return '\n';
        }

        const separator =
            node.type === 'paragraph' || node.type === 'heading' ? '' : '\n';

        return (node.content ?? []).map(text).join(separator);
    };

    return text(body.document);
}
