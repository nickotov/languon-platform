import { createHash, randomUUID } from 'node:crypto';
import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';

/** JSONB key order is not stable; compare content using canonical object keys. */
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, canonical(child)]),
    );
}

export function blockContentHash(block: LearningBlock): string {
    return createHash('sha256')
        .update(JSON.stringify(canonical(block)))
        .digest('hex');
}

export function findProposalBlock(
    node: unknown,
    id: string,
): LearningBlock | undefined {
    if (!node || typeof node !== 'object') return;
    const item = node as {
        type?: string;
        attrs?: { block?: LearningBlock };
        content?: unknown[];
    };

    if (item.type === 'learningBlock' && item.attrs?.block?.id === id)
        return item.attrs.block;
    for (const child of item.content ?? []) {
        const found = findProposalBlock(child, id);
        if (found) return found;
    }
}

export function replaceProposalBlock(
    node: unknown,
    id: string,
    block: LearningBlock,
): unknown {
    if (!node || typeof node !== 'object') return node;
    const item = node as {
        type?: string;
        attrs?: { block?: LearningBlock };
        content?: unknown[];
    };

    if (item.type === 'learningBlock' && item.attrs?.block?.id === id)
        return { ...item, attrs: { ...item.attrs, block } };
    if (!item.content) return node;

    return {
        ...item,
        content: item.content.map((child) =>
            replaceProposalBlock(child, id, block),
        ),
    };
}

/** Copies have new identities, including groups, while linked references stay aligned. */
export function freshProposalBlocks(blocks: LearningBlock[]): LearningBlock[] {
    const ids = new Map<string, string>();
    const find = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(find);

            return;
        }

        if (!value || typeof value !== 'object') return;
        const object = value as Record<string, unknown>;
        if (typeof object.id === 'string' && !ids.has(object.id))
            ids.set(object.id, randomUUID());
        Object.values(object).forEach(find);
    };

    find(blocks);
    const remap = (value: unknown, key?: string): unknown => {
        if (Array.isArray(value))
            return value.map((child) => remap(child, key));
        if (
            typeof value === 'string' &&
            key &&
            [
                'id',
                'blockId',
                'sourceSegmentId',
                'segmentIds',
                'correctChoiceId',
                'parentBlockId',
            ].includes(key)
        )
            return ids.get(value) ?? value;
        if (!value || typeof value !== 'object') return value;

        return Object.fromEntries(
            Object.entries(value).map(([name, child]) => [
                name,
                remap(child, name),
            ]),
        );
    };

    return LearningBlockSchema.array().max(75).parse(remap(blocks));
}
