import type { ExerciseLearningBlock } from '@languon/contracts';
import type { LearningAnswer } from '../types';

const normalize = (value: string) =>
    value.normalize('NFC').trim().replace(/\s+/gu, ' ');

/** Prepared checking never invents free-text correctness or calls an AI service. */
export function checkPreparedAnswer(
    block: ExerciseLearningBlock,
    answer: LearningAnswer,
): boolean | undefined {
    if (block.format === 'multiple-choice')
        return typeof answer === 'string' && answer === block.correctChoiceId;
    if (block.format !== 'fill-in-the-blank' || typeof answer === 'string')
        return undefined;
    return block.parts.every(
        (part) =>
            part.kind === 'text' ||
            part.acceptedAnswers.some(
                (accepted) =>
                    normalize(accepted) === normalize(answer[part.id] ?? ''),
            ),
    );
}
