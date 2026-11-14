import type { ExerciseLearningBlock } from '@languon/contracts';
import type { LearningAnswer } from '../types';

const normalize = (value: string) =>
    value.normalize('NFC').trim().replace(/\s+/gu, ' ');

/** Prepared variants are acceptance shortcuts; an unknown hybrid answer remains unchecked. */
export function checkPreparedAnswer(
    block: ExerciseLearningBlock,
    answer: LearningAnswer,
): boolean | undefined {
    const policy = block.semantics?.checking.policy;
    if (policy === 'ai-rubric') {
        return undefined;
    }

    if (block.format === 'multiple-choice') {
        return typeof answer === 'string' && answer === block.correctChoiceId;
    }

    if (block.format === 'free-text') {
        if (!block.semantics || typeof answer !== 'string') {
            return undefined;
        }

        const matched =
            block.acceptedAnswers?.some(
                (accepted) => normalize(accepted) === normalize(answer),
            ) ?? false;

        return matched ? true : undefined;
    }

    if (block.format !== 'fill-in-the-blank' || typeof answer === 'string') {
        return undefined;
    }

    const matched = block.parts.every(
        (part) =>
            part.kind === 'text' ||
            part.acceptedAnswers.some(
                (accepted) =>
                    normalize(accepted) === normalize(answer[part.id] ?? ''),
            ),
    );

    return matched || policy !== 'hybrid' ? matched : undefined;
}
