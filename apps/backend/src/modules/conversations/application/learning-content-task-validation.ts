import type { LearningBlock } from '@languon/contracts';
import {
    learningContentCapabilities,
    supportedLearningExerciseFormats,
    type LearningContentTask,
} from './learning-content-contract';

const normalized = (text: string) => text.normalize('NFKC').trim();
const proseWords = (text: string) => normalized(text).replace(/\s+/gu, ' ');

export function validateVocabulary(
    task: LearningContentTask,
    blocks: LearningBlock[],
) {
    const block = blocks[0];
    if (blocks.length !== 1 || block?.type !== 'vocabulary') {
        throw new Error('Vocabulary requires exactly one vocabulary block.');
    }

    const terms = block.entries.map((entry) => normalized(entry.term));
    if (new Set(terms).size !== terms.length) {
        throw new Error('Vocabulary entries must not repeat.');
    }

    const count = task.words?.length ?? task.count ?? 10;
    if (
        terms.length !== count ||
        (task.words &&
            task.words.some((word, index) => terms[index] !== normalized(word)))
    ) {
        throw new Error(
            'Vocabulary must preserve every requested word, its order and the requested count.',
        );
    }

    if (block.translationLanguage !== task.translationLanguage) {
        throw new Error(
            'Vocabulary translation language does not match the brief.',
        );
    }
}

export function validateExercises(
    task: LearningContentTask,
    blocks: LearningBlock[],
) {
    const count = task.count ?? 5;
    const formats = task.formats ?? supportedLearningExerciseFormats;
    if (
        blocks.length !== count ||
        blocks.some((block) => block.type !== 'exercise')
    ) {
        throw new Error(
            'Every requested exercise must be present as an exercise block.',
        );
    }

    const questions = blocks.map((block) =>
        block.type === 'exercise'
            ? proseWords(block.question).toLocaleLowerCase()
            : '',
    );

    if (new Set(questions).size !== questions.length) {
        throw new Error('Exercise questions must not repeat.');
    }

    blocks.forEach((block, index) => {
        if (
            block.type === 'exercise' &&
            block.format !== formats[index % formats.length]
        ) {
            throw new Error(
                'Exercise formats must follow the requested balanced distribution.',
            );
        }

        if (block.type === 'exercise' && block.format === 'multiple-choice') {
            const choices = block.choices.map((choice) =>
                proseWords(choice.text),
            );
            const correct = block.choices.find(
                (choice) => choice.id === block.correctChoiceId,
            )!;

            if (
                new Set(choices).size !== choices.length ||
                proseWords(block.referenceAnswer) !== proseWords(correct.text)
            ) {
                throw new Error(
                    'Multiple-choice answers must identify the correct distinct choice.',
                );
            }
        }
    });

    for (const word of task.words ?? []) {
        const escaped = normalized(word).replace(
            /[.*+?^${}()|[\]\\]/gu,
            '\\$&',
        );
        const pattern = new RegExp(
            `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
            'iu',
        );
        const exerciseText = blocks.flatMap((block) => {
            if (block.type !== 'exercise') {
                return [];
            }

            return [
                block.question,
                block.referenceAnswer,
                ...(block.format === 'multiple-choice'
                    ? block.choices.map((choice) => choice.text)
                    : []),
                ...(block.format === 'fill-in-the-blank'
                    ? block.parts.flatMap((part) =>
                          part.kind === 'text'
                              ? [part.text]
                              : part.acceptedAnswers,
                      )
                    : []),
            ];
        });

        if (
            !exerciseText.some((text) => pattern.test(text.normalize('NFKC')))
        ) {
            throw new Error('Exercises must cover every supplied word.');
        }
    }
}

export function validateSingleBlock(
    task: LearningContentTask,
    blocks: LearningBlock[],
) {
    const expectedType = learningContentCapabilities.find(
        (item) => item.kind === task.kind,
    )!.renderer;
    const block = blocks[0];
    if (blocks.length !== 1 || block?.type !== expectedType) {
        throw new Error('Requested content has the wrong block type or count.');
    }

    if (block.type === 'bilingual-text') {
        if (
            block.translations.length !== 1 ||
            block.translations[0]?.language !== task.translationLanguage
        ) {
            throw new Error(
                'Bilingual translation language does not match the brief.',
            );
        }

        if (
            task.sourceText &&
            proseWords(
                block.segments.map((segment) => segment.text).join(' '),
            ) !== proseWords(task.sourceText)
        ) {
            throw new Error(
                'Bilingual text must preserve the supplied source wording.',
            );
        }
    }
}
