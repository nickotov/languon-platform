import type { KnowledgeNoteContent } from '@languon/contracts';

function canonicalJson(value: unknown): string | undefined {
    return JSON.stringify(value, (_key, current: unknown) => {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
            return current;
        }

        return Object.fromEntries(
            Object.entries(current).sort(([left], [right]) =>
                left.localeCompare(right),
            ),
        );
    });
}

/** PostgreSQL JSONB can reorder object keys without changing authored content. */
export function hasUnpublishedKnowledgeChanges(
    content: KnowledgeNoteContent | undefined,
    published: KnowledgeNoteContent | null | undefined,
): boolean {
    if (!published) {
        return true;
    }

    if (!content) {
        return false;
    }

    const keys = Object.keys(content) as (keyof KnowledgeNoteContent)[];

    return keys.some(
        (key) => canonicalJson(content[key]) !== canonicalJson(published[key]),
    );
}
