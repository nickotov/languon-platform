import type { KnowledgeNode, LearningBlock } from '@languon/contracts';
import { authoringBlockGroup } from './authoring-block-group';
import type { PositionedBlock } from './positioned-learning-blocks';

export type KnowledgeBlockReference = {
    id: string;
    type: LearningBlock['type'];
    title: string;
};

/** Descriptors for UI discovery; authoritative material is resolved by the server. */
export function knowledgeBlockReferences(
    document: KnowledgeNode,
): KnowledgeBlockReference[] {
    const references: KnowledgeBlockReference[] = [];
    const seen = new Set<string>();
    function visit(node: KnowledgeNode) {
        const block = node.attrs?.block;
        if (node.type === 'learningBlock' && block && !seen.has(block.id)) {
            seen.add(block.id);
            references.push({
                id: block.id,
                type: block.type,
                title: blockReferenceTitle(block, references.length + 1),
            });
        }
        node.content?.forEach(visit);
    }
    visit(document);
    return references;
}

function excerpt(value: string) {
    return Array.from(value.replace(/\s+/gu, ' ').trim())
        .slice(0, 120)
        .join('');
}
function blockReferenceTitle(block: LearningBlock, ordinal: number): string {
    if (block.title?.trim()) return excerpt(block.title);
    switch (block.type) {
        case 'exercise':
            return excerpt(
                [block.group?.title, block.question].filter(Boolean).join(': '),
            );
        case 'grammar':
            return excerpt(block.rule ?? block.pattern ?? '') || `#${ordinal}`;
        case 'vocabulary':
            return `${excerpt(
                block.entries
                    .slice(0, 3)
                    .map((entry) => entry.term)
                    .join(', '),
            )} (${block.entries.length})`;
        case 'bilingual-text':
            return excerpt(block.segments[0]?.text ?? '') || `#${ordinal}`;
        case 'audio':
            return (
                excerpt(
                    block.sourceText ??
                        block.transcript?.segments[0]?.text ??
                        '',
                ) || `#${ordinal}`
            );
        case 'video':
            return (
                excerpt(
                    block.description ??
                        block.transcript?.segments[0]?.text ??
                        '',
                ) ||
                (block.source.kind === 'youtube'
                    ? `YouTube ${block.source.videoId}`
                    : `${new URL(block.source.url).hostname} · #${ordinal}`)
            );
    }
}

/** The heading menu represents a whole uninterrupted exercise/media group. */
export function knowledgeBlockMentionIds(
    document: KnowledgeNode,
    id: string,
): string[] {
    const positioned: PositionedBlock[] = [];
    let emptyGap = true;
    document.content?.forEach((node, index) => {
        const block = node.attrs?.block;
        if (node.type === 'learningBlock' && block) {
            const previous = positioned.at(-1);
            positioned.push({
                block,
                position: index,
                size: 1,
                ...(previous && emptyGap
                    ? { joinsAfter: previous.block.id }
                    : {}),
            });
            emptyGap = true;
        } else if (node.type !== 'paragraph' || (node.content?.length ?? 0) > 0)
            emptyGap = false;
    });
    const group = authoringBlockGroup(positioned, id);
    return group.length ? group.map((item) => item.block.id) : [id];
}
