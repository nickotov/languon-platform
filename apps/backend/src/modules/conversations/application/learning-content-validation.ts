import {
    LearningBlockProposalInputSchema,
    type LearningBlock,
    type LearningBlockProposalInput,
} from '@languon/contracts';
import {
    learningContentCapabilities,
    supportedLearningExerciseFormats,
    type LearningContentBrief,
    type LearningContentTask,
} from './learning-content-contract';

const normalized = (text: string) => text.normalize('NFKC').trim();
const proseWords = (text: string) => normalized(text).replace(/\s+/gu, ' ');

function validateVocabulary(
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

function validateExercises(task: LearningContentTask, blocks: LearningBlock[]) {
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

function validateTask(task: LearningContentTask, blocks: LearningBlock[]) {
    if (
        blocks.some(
            (block) => 'language' in block && block.language !== task.language,
        )
    ) {
        throw new Error('Generated language does not match the brief.');
    }

    if (task.kind === 'vocabulary') {
        validateVocabulary(task, blocks);
    } else if (task.kind === 'exercises') {
        validateExercises(task, blocks);
    } else {
        const expectedType = learningContentCapabilities.find(
            (item) => item.kind === task.kind,
        )!.renderer;
        const block = blocks[0];
        if (blocks.length !== 1 || block?.type !== expectedType) {
            throw new Error(
                'Requested content has the wrong block type or count.',
            );
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
}

function validateReferences(
    blocks: LearningBlock[],
    authorizedSources: readonly LearningBlock[],
) {
    const sources = new Map(
        [...authorizedSources, ...blocks].map((block) => [block.id, block]),
    );
    const ids = new Set<string>();
    const visit = (value: unknown): void => {
        if (!value || typeof value !== 'object') {
            return;
        }

        if (
            !Array.isArray(value) &&
            'id' in value &&
            typeof value.id === 'string'
        ) {
            if (ids.has(value.id)) {
                throw new Error('Generated identities must be unique.');
            }

            ids.add(value.id);
        }

        Object.entries(value).forEach(([key, child]) => {
            if (key !== 'group') {
                visit(child);
            }
        });
    };

    visit(blocks);

    const groups = new Map<string, string>();
    for (const block of blocks) {
        if (block.type !== 'exercise' || !block.group) {
            continue;
        }

        const content = JSON.stringify(block.group);
        if (
            ids.has(block.group.id) ||
            (groups.has(block.group.id) &&
                groups.get(block.group.id) !== content)
        ) {
            throw new Error(
                'Exercise groups require distinct, consistent identities.',
            );
        }

        groups.set(block.group.id, content);
    }

    const sourceIds = new Set<string>();
    const collectSourceIds = (value: unknown): void => {
        if (!value || typeof value !== 'object') {
            return;
        }

        if ('id' in value && typeof value.id === 'string') {
            sourceIds.add(value.id);
        }

        Object.values(value).forEach(collectSourceIds);
    };

    collectSourceIds(authorizedSources);

    if ([...ids, ...groups.keys()].some((id) => sourceIds.has(id))) {
        throw new Error(
            'New content must not replace authorized source identities.',
        );
    }

    for (const block of blocks) {
        if (block.type !== 'exercise') {
            continue;
        }

        if (
            block.group?.parentBlockId &&
            !sources.has(block.group.parentBlockId)
        ) {
            throw new Error(
                'Exercise parent does not identify available content.',
            );
        }

        if (!block.source) {
            continue;
        }

        const source = sources.get(block.source.blockId);
        const segments =
            source?.type === 'bilingual-text'
                ? source.segments
                : source && (source.type === 'audio' || source.type === 'video')
                  ? source.transcript?.segments
                  : undefined;

        if (
            !segments ||
            block.source.segmentIds.some(
                (id) => !segments.some((segment) => segment.id === id),
            )
        ) {
            throw new Error(
                'Exercise references must identify authorized source passages.',
            );
        }
    }
}

/** Provider task identities are matched to the brief; provider ordering cannot reorder the proposal. */
export function validateLearningContent(
    brief: LearningContentBrief,
    tasks: { taskId: string; blocks: LearningBlock[] }[],
    authorizedSources: readonly LearningBlock[] = [],
): LearningBlockProposalInput {
    if (
        tasks.length !== brief.tasks.length ||
        new Set(tasks.map((task) => task.taskId)).size !== tasks.length
    ) {
        throw new Error('All requested tasks must appear exactly once.');
    }

    const blocks = brief.tasks.flatMap((task) => {
        const result = tasks.find((candidate) => candidate.taskId === task.id);
        if (!result) {
            throw new Error('A requested task is missing.');
        }

        const parsed = LearningBlockProposalInputSchema.parse({
            blocks: result.blocks,
        });

        validateTask(task, parsed.blocks);

        return parsed.blocks;
    });

    const proposal = LearningBlockProposalInputSchema.parse({ blocks });
    validateReferences(proposal.blocks, authorizedSources);

    return proposal;
}
