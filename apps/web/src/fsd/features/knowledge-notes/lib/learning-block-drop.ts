import type { Slice } from '@tiptap/pm/model';

/** Moves preserve identity; copies must use the validated, identity-aware actions. */
export function rejectCopiedLearningBlockDrop(
    slice: Slice,
    moved: boolean,
): boolean {
    if (moved) return false;
    let containsLearningBlock = false;
    slice.content.descendants((node) => {
        if (node.type.name === 'learningBlock') containsLearningBlock = true;
    });
    return containsLearningBlock;
}
