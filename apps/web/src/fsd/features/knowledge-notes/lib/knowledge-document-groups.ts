import type {
    KnowledgeBody,
    KnowledgeNode,
    ExerciseLearningBlock,
} from '@languon/contracts';

function learningBlock(node: KnowledgeNode | undefined) {
    return node?.type === 'learningBlock' ? node.attrs?.block : undefined;
}
function emptyProse(node: KnowledgeNode) {
    return node.type === 'paragraph' && (node.content?.length ?? 0) === 0;
}

/** Group only contiguous content; meaningful prose or another source always ends a group. */
export function knowledgeDocumentGroups(body: KnowledgeBody) {
    const nodes = body.document.content ?? [];
    const groups = new Map<string, ExerciseLearningBlock[]>();
    const linked = new Map<string, ExerciseLearningBlock[]>();
    const consumed = new Set<number>();
    function collect(
        start: number,
        matches: (block: ExerciseLearningBlock) => boolean,
    ) {
        const found: ExerciseLearningBlock[] = [];
        let end = start - 1;
        for (let index = start; index < nodes.length; index++) {
            const node = nodes[index]!;
            if (emptyProse(node)) continue;
            const block = learningBlock(node);
            if (block?.type !== 'exercise' || !matches(block)) break;
            found.push(block);
            end = index;
        }
        return { found, end };
    }
    for (let index = 0; index < nodes.length; index++) {
        if (consumed.has(index)) continue;
        const block = learningBlock(nodes[index]);
        if (!block) continue;
        if (block.type === 'audio' || block.type === 'video') {
            const next = collect(
                index + 1,
                (exercise) =>
                    exercise.group?.parentBlockId === block.id ||
                    exercise.source?.blockId === block.id,
            );
            if (next.found.length) {
                linked.set(block.id, next.found);
                for (let child = index + 1; child <= next.end; child++)
                    consumed.add(child);
            }
        } else if (block.type === 'exercise' && block.group) {
            const groupId = block.group.id;
            const next = collect(
                index,
                (exercise) => exercise.group?.id === groupId,
            );
            groups.set(block.id, next.found);
            for (let child = index + 1; child <= next.end; child++)
                consumed.add(child);
        }
    }
    const blocks = nodes.flatMap((node) => {
        const block = learningBlock(node);
        return block ? [block] : [];
    });
    return {
        body: {
            ...body,
            document: {
                ...body.document,
                content: nodes.filter((_node, index) => !consumed.has(index)),
            },
        },
        groups,
        linked,
        blocks,
    };
}
