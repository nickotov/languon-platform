import { KnowledgeBodySchema, type KnowledgeBody } from '@languon/contracts';
import { KnowledgeDomainError } from '../../../domain/knowledge';

/** Copy requested media with inline questions; other dependencies never pull unrelated siblings. */
export function selectKnowledgeBlocksForCopy(
    body: KnowledgeBody,
    selectedIds: string[],
): KnowledgeBody {
    const all = (body.document.content ?? []).filter(
        (node) => node.type === 'learningBlock',
    );
    const byId = new Map(all.map((node) => [node.attrs!.block!.id, node]));
    const selected = new Set(selectedIds);
    for (const id of selectedIds) {
        const target = byId.get(id)?.attrs?.block;
        if (!target)
            throw new KnowledgeDomainError(
                'version_conflict',
                'The selected source changed. Refresh before copying.',
            );
        if (target.type === 'audio' || target.type === 'video') {
            for (const node of all) {
                const block = node.attrs?.block;
                if (
                    block?.type === 'exercise' &&
                    (block.group?.parentBlockId === id ||
                        block.source?.blockId === id)
                )
                    selected.add(block.id);
            }
        }
    }

    for (const id of selected) {
        const block = byId.get(id)?.attrs?.block;
        if (block?.type === 'exercise' && block.source)
            selected.add(block.source.blockId);
        if (selected.size > 50)
            throw new KnowledgeDomainError(
                'invalid_request',
                'Select fewer blocks so their source material can be copied together.',
            );
    }

    return KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: all
                .filter((node) => selected.has(node.attrs!.block!.id))
                .map((node) => {
                    const block = node.attrs!.block!;
                    if (
                        block.type !== 'exercise' ||
                        !block.group?.parentBlockId ||
                        selected.has(block.group.parentBlockId)
                    )
                        return node;
                    const { parentBlockId: _parentBlockId, ...group } =
                        block.group;

                    return {
                        ...node,
                        attrs: { ...node.attrs, block: { ...block, group } },
                    };
                }),
        },
    });
}
