import type { LearningAnswer } from '../types';

export function learningAnswerEquals(
    left: LearningAnswer,
    right: LearningAnswer,
) {
    if (typeof left === 'string' || typeof right === 'string')
        return left === right;
    const keys = Object.keys(left);
    return (
        keys.length === Object.keys(right).length &&
        keys.every((key) => left[key] === right[key])
    );
}
