import type { WorkbookAttemptAnswer } from '@languon/contracts';
import type { LearningAnswer } from '@/fsd/entities/learning-blocks';

export function learnerAnswer(answer: WorkbookAttemptAnswer): LearningAnswer {
    if (answer.format === 'multiple-choice') return answer.choiceId;
    if (answer.format === 'free-text') return answer.text;
    return Object.fromEntries(answer.gaps.map((gap) => [gap.id, gap.answer]));
}
