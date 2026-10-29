import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';

export const learningBlockClipboardType =
    'application/x-languon-learning-block+json';
export const learningBlockClipboardPrefix = 'LANGUON_BLOCK_V1\n';

/** Copy content identities, never learner history or media access authority. */
export function copyLearningBlock(value: unknown): LearningBlock {
    return copyLearningBlocks([value])[0]!;
}

/** Shared remapping preserves a copied question set while giving it a fresh group identity. */
export function copyLearningBlocks(values: unknown[]): LearningBlock[] {
    const parsed = values.map((value) => LearningBlockSchema.parse(value));
    const parentIds = new Set(
        parsed
            .filter((block) => block.type === 'audio' || block.type === 'video')
            .map((block) => block.id),
    );
    const blocks = parsed.map((block) => {
        if (
            block.type !== 'exercise' ||
            !block.group?.parentBlockId ||
            parentIds.has(block.group.parentBlockId)
        )
            return block;
        const { parentBlockId: _parent, ...group } = block.group;
        return { ...block, group };
    });
    for (const block of blocks) {
        if (block.type === 'audio')
            throw new Error(
                'Copy audio through the authorized media-copy operation.',
            );
        if (block.type === 'exercise' && block.source)
            throw new Error(
                'Copy the exercise together with its source passages.',
            );
    }
    const ids = new Map<string, string>();
    function fresh(id: string): string {
        const result = ids.get(id) ?? crypto.randomUUID();
        ids.set(id, result);
        return result;
    }
    function remap(value: unknown): unknown {
        if (Array.isArray(value)) return value.map(remap);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => {
                if (key === 'id' && typeof item === 'string')
                    return [key, fresh(item)];
                if (
                    [
                        'sourceSegmentId',
                        'correctChoiceId',
                        'parentBlockId',
                    ].includes(key) &&
                    typeof item === 'string'
                )
                    return [key, fresh(item)];
                return [key, remap(item)];
            }),
        );
    }
    return blocks.map((block) => LearningBlockSchema.parse(remap(block)));
}
