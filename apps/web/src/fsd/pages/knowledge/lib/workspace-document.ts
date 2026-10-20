import type { KnowledgeNode } from '@languon/contracts';

export function hasKnowledgeText(node: KnowledgeNode): boolean {
    if (node.text?.trim()) return true;
    return node.content?.some(hasKnowledgeText) ?? false;
}

/** Complete fallback projection while the editor initializes. */
export function knowledgePlainText(node: KnowledgeNode): string {
    if (node.text) return node.text;
    if (node.type === 'hardBreak') return '\n';
    const children = node.content?.map(knowledgePlainText) ?? [];
    return children.join(
        ['doc', 'bulletList', 'orderedList', 'table', 'tableRow'].includes(
            node.type,
        )
            ? '\n'
            : '',
    );
}
