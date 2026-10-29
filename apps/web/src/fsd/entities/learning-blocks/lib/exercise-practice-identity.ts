import type { ExerciseLearningBlock } from '@languon/contracts';

/** Cosmetic and explanatory corrections must not clear local practice observations. */
export function exercisePracticeIdentity(
    block: ExerciseLearningBlock,
    revision?: string,
) {
    const {
        explanation: _explanation,
        title: _title,
        group: _group,
        hint: _hint,
        ...material
    } = block;
    return JSON.stringify([material, revision]);
}
