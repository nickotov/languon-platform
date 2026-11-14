import {
    LearningBlockIdSchema,
    LearningBlockSchema,
    type LearningBlock,
} from '@languon/contracts';

export const learningBlockClipboardType =
    'application/x-languon-learning-block+json';
export const learningBlockClipboardPrefix = 'LANGUON_BLOCK_V1\n';

function historicalExerciseSource(value: Record<string, unknown>): boolean {
    const origin = value.origin;

    return (
        value.kind === 'text-selection' ||
        ((value.kind === 'vocabulary' ||
            value.kind === 'grammar' ||
            value.kind === 'text') &&
            typeof origin === 'object' &&
            origin !== null &&
            (origin as Record<string, unknown>).kind === 'proposal')
    );
}

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
        ) {
            return block;
        }

        const { parentBlockId: _parent, ...group } = block.group;

        return { ...block, group };
    });
    const includedBlockIds = new Set(blocks.map((block) => block.id));

    for (const block of blocks) {
        if (block.type === 'audio') {
            throw new Error(
                'Copy audio through the authorized media-copy operation.',
            );
        }

        if (block.type === 'exercise' && block.source) {
            throw new Error(
                'Copy the exercise together with its source passages.',
            );
        }

        if (
            block.type === 'exercise' &&
            block.semantics?.sources.some(
                (source) =>
                    source.kind !== 'text-selection' &&
                    source.origin.kind === 'block' &&
                    !includedBlockIds.has(source.origin.blockId),
            )
        ) {
            throw new Error(
                'Copy the named exercise together with its source material.',
            );
        }
    }

    const ids = new Map<string, string>();
    function fresh(id: string): string {
        const result = ids.get(id) ?? crypto.randomUUID();
        ids.set(id, result);

        return result;
    }

    function collect(value: unknown): void {
        if (Array.isArray(value)) {
            value.forEach(collect);

            return;
        }

        if (!value || typeof value !== 'object') {
            return;
        }

        if (historicalExerciseSource(value as Record<string, unknown>)) {
            return;
        }

        for (const [key, item] of Object.entries(value)) {
            if (key === 'id' && LearningBlockIdSchema.safeParse(item).success) {
                fresh(item as string);
            }

            collect(item);
        }
    }

    blocks.forEach(collect);

    function remap(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map(remap);
        }

        if (!value || typeof value !== 'object') {
            return value;
        }

        // Preserve historical source identities even when copied local IDs collide.
        if (historicalExerciseSource(value as Record<string, unknown>)) {
            return value;
        }

        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => {
                if (
                    [
                        'id',
                        'blockId',
                        'sourceSegmentId',
                        'correctChoiceId',
                        'parentBlockId',
                        'choiceId',
                        'gapId',
                        'entryId',
                        'segmentId',
                    ].includes(key) &&
                    typeof item === 'string'
                ) {
                    return [key, ids.get(item) ?? item];
                }

                return [key, remap(item)];
            }),
        );
    }

    return blocks.map((block) => LearningBlockSchema.parse(remap(block)));
}
