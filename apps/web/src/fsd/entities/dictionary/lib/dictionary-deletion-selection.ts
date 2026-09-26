import { dictionaryDeletionSelectedTargetLimit } from '@languon/contracts';

export type DeletionSelectionUpdate = {
    limitReached: boolean;
    selected: ReadonlySet<string>;
};

export function toggleDeletionTarget(
    current: ReadonlySet<string>,
    targetId: string,
): DeletionSelectionUpdate {
    const selected = new Set(current);
    if (selected.has(targetId)) {
        selected.delete(targetId);
        return { limitReached: false, selected };
    }
    if (selected.size >= dictionaryDeletionSelectedTargetLimit) {
        return { limitReached: true, selected };
    }
    selected.add(targetId);
    return { limitReached: false, selected };
}

export function toggleLoadedDeletionTargets(
    current: ReadonlySet<string>,
    targetIds: readonly string[],
): DeletionSelectionUpdate {
    const selected = new Set(current);
    if (targetIds.every((targetId) => selected.has(targetId))) {
        for (const targetId of targetIds) selected.delete(targetId);
        return { limitReached: false, selected };
    }

    let limitReached = false;
    for (const targetId of targetIds) {
        if (selected.has(targetId)) continue;
        if (selected.size >= dictionaryDeletionSelectedTargetLimit) {
            limitReached = true;
            break;
        }
        selected.add(targetId);
    }
    return { limitReached, selected };
}
