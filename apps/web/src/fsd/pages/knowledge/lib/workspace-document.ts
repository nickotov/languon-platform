import type { KnowledgeNode } from '@languon/contracts';
import { learningBlockPlainText } from '@/fsd/features/knowledge-notes';

export function hasKnowledgeText(node: KnowledgeNode): boolean {
    if (node.type === 'learningBlock' && node.attrs?.block) return true;
    if (node.text?.trim()) return true;
    return node.content?.some(hasKnowledgeText) ?? false;
}

/** Complete fallback projection while the editor initializes. */
export function knowledgePlainText(node: KnowledgeNode): string {
    if (node.type === 'learningBlock' && node.attrs?.block)
        return learningBlockPlainText(node.attrs.block);
    if (node.text) return node.text;
    if (node.type === 'hardBreak' || node.type === 'horizontalRule')
        return '\n';
    const children = node.content?.map(knowledgePlainText) ?? [];
    return children.join(
        ['doc', 'bulletList', 'orderedList', 'table', 'tableRow'].includes(
            node.type,
        )
            ? '\n'
            : '',
    );
}
