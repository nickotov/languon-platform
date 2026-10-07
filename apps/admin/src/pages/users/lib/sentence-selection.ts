import type {
    AdminSentenceLibraryItem,
    SentenceLibrarySelection,
} from '@languon/contracts';

export function sentenceSelection(
    items: AdminSentenceLibraryItem[],
    selected: string[],
): SentenceLibrarySelection {
    const ids = new Set(selected);
    const matching = items.filter((item) => ids.has(item.exerciseId));
    if (!matching.length || matching.length !== ids.size)
        throw new Error('Refresh and select the examples again.');
    return {
        type: 'selected',
        items: matching.map((item) => ({
            exerciseId: item.exerciseId,
            expectedVersion: item.version,
        })),
    };
}

export function canDeleteSentences(
    items: AdminSentenceLibraryItem[],
    selected: string[],
) {
    const ids = new Set(selected);
    const matching = items.filter((item) => ids.has(item.exerciseId));
    return (
        matching.length > 0 &&
        matching.length === ids.size &&
        matching.every((item) => item.creatorArchived)
    );
}
