import type { KnowledgeBody, KnowledgeErrorCode } from '@languon/contracts';

export class KnowledgeDomainError extends Error {
    constructor(
        readonly code: KnowledgeErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'KnowledgeDomainError';
    }
}

/** Searchable text is derived from validated content, never supplied separately by callers. */
export function knowledgeBodyPlainText(body: KnowledgeBody): string {
    const parts: string[] = [];
    const walk = (node: KnowledgeBody['document']) => {
        if (node.text) parts.push(node.text);
        node.content?.forEach(walk);
        if (
            [
                'paragraph',
                'heading',
                'tableCell',
                'tableHeader',
                'hardBreak',
            ].includes(node.type)
        )
            parts.push('\n');
    };
    walk(body.document);
    return parts.join('').replace(/\s+/gu, ' ').trim();
}
