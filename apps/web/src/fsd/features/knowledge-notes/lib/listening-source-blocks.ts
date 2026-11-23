import type { KnowledgeBody, LearningBlock } from '@languon/contracts';
export function listeningSourceBlocks(
    body: KnowledgeBody,
    dependencies?: LearningBlock[],
) {
    const blocks =
        body.document.content?.flatMap((node) => node.attrs?.block ?? []) ?? [];
    const references = new Set(
        blocks.flatMap((block) =>
            block.type === 'exercise' &&
            block.semantics?.sources.some(
                (source) => source.kind === 'audio',
            ) &&
            block.source
                ? [block.source.blockId]
                : [],
        ),
    );
    const ownIds = new Set(blocks.map((block) => block.id));

    return (dependencies ?? []).filter(
        (block) =>
            block.type === 'audio' &&
            references.has(block.id) &&
            !ownIds.has(block.id),
    );
}
