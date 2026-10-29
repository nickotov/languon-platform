import { createHash } from 'node:crypto';
import type {
    ExerciseLearningBlock,
    LearningBlock,
    WorkbookAttemptAnswer,
    WorkbookAttemptEvaluation,
} from '@languon/contracts';

export class WorkbookLearningError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkbookLearningError';
    }
}

function sourceDescriptor(
    exercise: ExerciseLearningBlock,
    blocks: readonly LearningBlock[],
) {
    if (!exercise.source) return null;
    const source = blocks.find(
        (block) => block.id === exercise.source!.blockId,
    );
    if (!source)
        throw new WorkbookLearningError('Exercise source is unavailable.');
    const ids = exercise.source.segmentIds;
    if (source.type === 'bilingual-text') {
        return {
            type: source.type,
            language: source.language,
            passages: ids.map((id) => {
                const segment = source.segments.find((item) => item.id === id);
                if (!segment)
                    throw new WorkbookLearningError(
                        'Exercise passage is unavailable.',
                    );
                return {
                    text: segment.text,
                    translations: source.translations.map((translation) => ({
                        language: translation.language,
                        text:
                            translation.segments.find(
                                (item) => item.sourceSegmentId === id,
                            )?.text ?? null,
                    })),
                };
            }),
        };
    }
    if (source.type === 'audio' || source.type === 'video') {
        const segments = source.transcript?.segments;
        if (!segments)
            throw new WorkbookLearningError(
                'Exercise transcript is unavailable.',
            );
        return {
            type: source.type,
            media:
                source.type === 'audio'
                    ? { assetId: source.assetId }
                    : source.source,
            ...(source.type === 'video' && source.description
                ? { description: source.description }
                : {}),
            language: source.transcript!.language,
            ...(source.type === 'audio' &&
            source.language &&
            source.language.toLowerCase() !==
                source.transcript!.language.toLowerCase()
                ? { audioLanguage: source.language }
                : {}),
            passages: ids.map((id) => {
                const segment = segments.find((item) => item.id === id);
                if (!segment)
                    throw new WorkbookLearningError(
                        'Exercise transcript passage is unavailable.',
                    );
                return { text: segment.text, timing: segment.timing ?? null };
            }),
        };
    }
    throw new WorkbookLearningError('Exercise source has no passages.');
}

/** Server-generated descriptor: presentation, explanations and opaque item IDs do not reset attempts. */
export function exerciseSemanticDescriptor(
    exercise: ExerciseLearningBlock,
    blocks: readonly LearningBlock[] = [],
): string {
    let format;
    if (exercise.format === 'multiple-choice') {
        const correctIndex = exercise.choices.findIndex(
            (choice) => choice.id === exercise.correctChoiceId,
        );
        if (correctIndex < 0)
            throw new WorkbookLearningError('Correct choice is unavailable.');
        format = {
            kind: exercise.format,
            choices: exercise.choices.map((choice) => choice.text),
            correctIndex,
        };
    } else if (exercise.format === 'fill-in-the-blank') {
        format = {
            kind: exercise.format,
            parts: exercise.parts.map((part) =>
                part.kind === 'text'
                    ? { kind: part.kind, text: part.text }
                    : {
                          kind: part.kind,
                          acceptedAnswers: part.acceptedAnswers,
                      },
            ),
        };
    } else {
        format = {
            kind: exercise.format,
            acceptedAnswers: exercise.acceptedAnswers ?? [],
        };
    }
    return JSON.stringify(
        {
            descriptorVersion: 1,
            question: exercise.question,
            referenceAnswer: exercise.referenceAnswer,
            evaluationCriteria: exercise.evaluationCriteria ?? null,
            format,
            source: sourceDescriptor(exercise, blocks),
        },
        (_key, value: unknown) => {
            if (!value || typeof value !== 'object' || Array.isArray(value))
                return value;
            return Object.fromEntries(
                Object.entries(value).sort(([left], [right]) =>
                    left < right ? -1 : left > right ? 1 : 0,
                ),
            );
        },
    );
}

export function exerciseSemanticRevision(
    exercise: ExerciseLearningBlock,
    blocks: readonly LearningBlock[] = [],
): string {
    return createHash('sha256')
        .update(exerciseSemanticDescriptor(exercise, blocks), 'utf8')
        .digest('hex');
}

/** NFC and insignificant whitespace only. Case/punctuation remain meaningful; AI can judge alternatives. */
function normalizeAnswer(value: string) {
    return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function evaluateWorkbookAnswer(
    exercise: ExerciseLearningBlock,
    answer: WorkbookAttemptAnswer,
): WorkbookAttemptEvaluation {
    if (exercise.format !== answer.format)
        throw new WorkbookLearningError(
            'Answer format does not match the exercise.',
        );
    if (exercise.format === 'free-text') return { status: 'unchecked' };
    let correct = false;
    if (
        exercise.format === 'multiple-choice' &&
        answer.format === 'multiple-choice'
    ) {
        if (!exercise.choices.some((choice) => choice.id === answer.choiceId))
            throw new WorkbookLearningError('Answer choice is unavailable.');
        correct = answer.choiceId === exercise.correctChoiceId;
    }
    if (
        exercise.format === 'fill-in-the-blank' &&
        answer.format === 'fill-in-the-blank'
    ) {
        const gaps = exercise.parts.filter((part) => part.kind === 'gap');
        const submitted = new Map(
            answer.gaps.map((gap) => [gap.id, gap.answer]),
        );
        if (
            submitted.size !== answer.gaps.length ||
            submitted.size !== gaps.length ||
            gaps.some((gap) => !submitted.has(gap.id))
        )
            throw new WorkbookLearningError(
                'Answers must match every exercise gap exactly once.',
            );
        correct = gaps.every((gap) =>
            gap.acceptedAnswers.some(
                (accepted) =>
                    normalizeAnswer(accepted) ===
                    normalizeAnswer(submitted.get(gap.id)!),
            ),
        );
    }
    return {
        status: correct ? 'correct' : 'incorrect',
        method: 'deterministic',
    };
}

/** Completion is an explicit learner action, retained when newer content appears. */
export function noteUpdatedSinceCompletion(
    completedNoteVersion: number,
    currentNoteVersion: number,
): boolean {
    return currentNoteVersion > completedNoteVersion;
}
