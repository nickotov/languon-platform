import type {
    ExerciseLearningBlock,
    WorkbookAttemptAnswer,
} from '@languon/contracts';
import { WorkbookAttemptAnswerSchema } from '@languon/contracts';
import type { LearningAnswer } from '@/fsd/entities/learning-blocks';
export function attemptAnswer(
    block: ExerciseLearningBlock,
    answer: LearningAnswer,
): WorkbookAttemptAnswer {
    if (block.format === 'multiple-choice')
        return WorkbookAttemptAnswerSchema.parse({
            format: block.format,
            choiceId: answer,
        });
    if (block.format === 'free-text')
        return WorkbookAttemptAnswerSchema.parse({
            format: block.format,
            text: answer,
        });
    if (typeof answer === 'string') throw new Error('Expected gap answers.');
    return WorkbookAttemptAnswerSchema.parse({
        format: block.format,
        gaps: block.parts
            .filter((part) => part.kind === 'gap')
            .map((part) => ({ id: part.id, answer: answer[part.id] ?? '' })),
    });
}
