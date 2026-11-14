import type {
    ExerciseLearningBlock,
    LearningBlock,
    NamedExerciseSource,
} from '@languon/contracts';
import { WorkbookLearningError } from './workbook-learning-error';

function frozenSource(source: NamedExerciseSource) {
    if (source.kind === 'vocabulary') {
        return {
            kind: source.kind,
            entries: source.entries.map((entry) => ({
                term: entry.term,
                sense: entry.sense,
            })),
        };
    }

    if (source.kind === 'grammar') {
        return { kind: source.kind, rule: source.rule };
    }

    if (source.kind === 'text') {
        return {
            kind: source.kind,
            passages: source.passages.map((passage) => passage.text),
        };
    }

    return { kind: source.kind, text: source.text };
}

function currentSource(
    source: NamedExerciseSource,
    blocks: readonly LearningBlock[],
) {
    if (source.kind === 'text-selection' || source.origin.kind !== 'block') {
        return null;
    }

    const blockId = source.origin.blockId;
    const target = blocks.find((block) => block.id === blockId);
    if (!target) {
        throw new WorkbookLearningError(
            'Named exercise source is unavailable.',
        );
    }

    if (source.kind === 'vocabulary' && target.type === 'vocabulary') {
        return {
            language: target.language,
            translationLanguage: target.translationLanguage,
            entries: source.entries.map((entry) => {
                const current = target.entries.find(
                    (item) => item.id === entry.entryId,
                );

                if (!current) {
                    throw new WorkbookLearningError(
                        'Named exercise vocabulary source is unavailable.',
                    );
                }

                return {
                    term: current.term,
                    translation: current.translation,
                    definition: current.definition ?? null,
                    example: current.example ?? null,
                };
            }),
        };
    }

    if (source.kind === 'grammar' && target.type === 'grammar') {
        return {
            language: target.language,
            rule: target.rule ?? null,
            pattern: target.pattern ?? null,
            examples: target.examples ?? [],
            commonMistakes: target.commonMistakes ?? [],
        };
    }

    if (source.kind === 'text' && target.type === 'bilingual-text') {
        return {
            language: target.language,
            passages: source.passages.map((passage) => {
                const current = target.segments.find(
                    (item) => item.id === passage.segmentId,
                );

                if (!current) {
                    throw new WorkbookLearningError(
                        'Named exercise passage source is unavailable.',
                    );
                }

                return {
                    text: current.text,
                    translations: target.translations.map((translation) => ({
                        language: translation.language,
                        text:
                            translation.segments.find(
                                (item) =>
                                    item.sourceSegmentId === passage.segmentId,
                            )?.text ?? null,
                    })),
                };
            }),
        };
    }

    throw new WorkbookLearningError(
        'Named exercise source has the wrong material kind.',
    );
}

/** UUID remapping and explanation-only edits do not alter the task answered. */
export function namedExerciseSemanticDescriptor(
    exercise: ExerciseLearningBlock,
    blocks: readonly LearningBlock[],
) {
    const semantics = exercise.semantics;
    if (!semantics) {
        return undefined;
    }

    return {
        activity: semantics.activity,
        objective: semantics.objective,
        language: semantics.language,
        checking: {
            policy: semantics.checking.policy,
            // Prepared answers already participate through the canonical format
            // descriptor; key explanation text is deliberately cosmetic.
            rubric:
                'rubric' in semantics.checking
                    ? semantics.checking.rubric
                    : null,
        },
        sources: semantics.sources.map((source) => ({
            frozen: frozenSource(source),
            current: currentSource(source, blocks),
        })),
    };
}
