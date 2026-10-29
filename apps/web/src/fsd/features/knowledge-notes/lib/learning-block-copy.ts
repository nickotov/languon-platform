import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';

export const learningBlockClipboardType =
    'application/x-languon-learning-block+json';
export const learningBlockClipboardPrefix = 'LANGUON_BLOCK_V1\n';

/** Copy content identities, never learner history or media access authority. */
export function copyLearningBlock(value: unknown): LearningBlock {
    const block = LearningBlockSchema.parse(value);
    if (block.type === 'audio')
        throw new Error(
            'Copy audio through the authorized media-copy operation.',
        );
    if (block.type === 'exercise' && block.source)
        throw new Error('Copy the exercise together with its source passages.');
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
                    ['sourceSegmentId', 'correctChoiceId'].includes(key) &&
                    typeof item === 'string'
                )
                    return [key, fresh(item)];
                return [key, remap(item)];
            }),
        );
    }
    return LearningBlockSchema.parse(remap(block));
}
