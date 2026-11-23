import {
    compareDictation,
    type ExerciseLearningBlock,
} from '@languon/contracts';
import type { LearningAnswer } from '../types';

const normalize = (value: string) =>
    value.normalize('NFC').trim().replace(/\s+/gu, ' ');

export function matchesPreparedAnswer(
    accepted: readonly string[],
    submitted: string,
) {
    return accepted.some((value) => normalize(value) === normalize(submitted));
}

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

        if (block.semantics.activity.id === 'L02') {
            return compareDictation(
                block.referenceAnswer,
                answer,
                block.semantics.language,
            ).every((word) => word.kind === 'matched');
        }

        const matched = matchesPreparedAnswer(
            block.acceptedAnswers ?? [],
            answer,
        );

        return matched ? true : undefined;
    }

    if (block.format !== 'fill-in-the-blank' || typeof answer === 'string') {
        return undefined;
    }

    const matched = block.parts.every(
        (part) =>
            part.kind === 'text' ||
            matchesPreparedAnswer(part.acceptedAnswers, answer[part.id] ?? ''),
    );

    return matched || policy !== 'hybrid' ? matched : undefined;
}
