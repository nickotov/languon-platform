import {
    exerciseActivityCatalog,
    type ExerciseActivityMetadata,
    type ExerciseLearningBlock,
    type LearningBlock,
    type NamedExerciseChecking,
    type NamedExerciseSource,
    type NamedExerciseRubric,
    type WorkbookAttemptEvaluation,
} from '@languon/contracts';
import { exampleFeedback, exampleLocale } from './example-feedback';
import { activityUseCaseGuidance } from './example-guidance';
import { exampleSpecs, type ExampleSpec } from './example-specs';

export type ExerciseActivityExample = {
    activity: ExerciseActivityMetadata;
    block: ExerciseLearningBlock;
    sources: LearningBlock[];
    sourceText: string;
    recording?: {
        block: Extract<LearningBlock, { type: 'audio' }>;
        url: string;
        excerpt: NonNullable<
            Extract<LearningBlock, { type: 'audio' }>['transcript']
        >;
    };
    explanation: string;
    useCaseGuidance: string;
    sampleResponses: {
        id: string;
        label: string;
        answer: string;
        evaluation: WorkbookAttemptEvaluation;
    }[];
};

const uuid = (value: number) =>
    `00000000-0068-4000-8000-${String(value).padStart(12, '0')}`;
const passage =
    'Maya goes to the library every Saturday. She usually takes the bus. Today she is walking to the library because the bus is late. She wants to return two books and borrow a story book. At the library, a helpful librarian helps her find a book about animals.';
const rule =
    'Use present simple for habits and routines: Maya usually takes the bus. With he, she or it, add -s to the verb. Use present continuous (am/is/are + verb-ing) for actions happening now: Today Maya is walking to the library.';
const vocabulary = [
    ['borrow', 'take something for a short time and give it back'],
    ['return', 'give something back'],
    ['take the bus', 'travel by bus'],
    ['help', 'make something easier for someone; assistance'],
    ['helpful', 'giving useful help'],
] as const;

/** Original dialogue voiced offline with CMU Flite 2.2 (rms and slt); timings in seconds. */
const libraryAudio = {
    id: uuid(4),
    type: 'audio',
    title: 'At the library',
    language: 'en',
    assetId: uuid(23),
    transcript: {
        language: 'en',
        segments: [
            {
                id: uuid(21),
                speaker: 'Visitor',
                text: 'Good morning. Can I borrow this book?',
                timing: { startSeconds: 0, endSeconds: 2.6 },
            },
            {
                id: uuid(22),
                speaker: 'Librarian',
                text: 'Of course. Please return it on Friday.',
                timing: { startSeconds: 2.95, endSeconds: 5.74 },
            },
        ],
    },
} satisfies Extract<LearningBlock, { type: 'audio' }>;

export const exerciseExampleSources: LearningBlock[] = [
    {
        id: uuid(1),
        type: 'vocabulary',
        language: 'en',
        translationLanguage: 'en',
        title: 'At the library',
        entries: vocabulary.map(([term, meaning], index) => ({
            id: uuid(10 + index),
            term,
            translation: meaning,
            definition: meaning,
        })),
    },
    {
        id: uuid(2),
        type: 'grammar',
        language: 'en',
        title: 'Habits and actions now',
        rule,
    },
    {
        id: uuid(3),
        type: 'bilingual-text',
        language: 'en',
        title: 'Maya’s library visit',
        segments: [{ id: uuid(20), text: passage }],
        translations: [],
    },
    libraryAudio,
];

function frozenSource(activity: ExerciseActivityMetadata): {
    source: LearningBlock;
    frozen: NamedExerciseSource;
    text: string;
} {
    if (activity.category === 'listening') {
        const segments =
            activity.id === 'L01'
                ? libraryAudio.transcript.segments.slice(0, 1)
                : libraryAudio.transcript.segments.slice(1);

        return {
            source: libraryAudio,
            text: libraryAudio.title,
            frozen: {
                kind: 'audio',
                origin: { kind: 'block', blockId: libraryAudio.id },
                assetId: libraryAudio.assetId,
                passages: segments.map(({ id, text }) => ({
                    segmentId: id,
                    text,
                })),
            },
        };
    }

    if (activity.category === 'vocabulary') {
        const source = exerciseExampleSources[0]!;

        return {
            source,
            frozen: {
                kind: 'vocabulary',
                origin: { kind: 'block', blockId: source.id },
                entries: vocabulary.map(([term, sense], index) => ({
                    entryId: uuid(10 + index),
                    term,
                    sense,
                })),
            },
            text: vocabulary
                .map(([term, sense]) => `${term} — ${sense}`)
                .join('\n'),
        };
    }

    if (activity.category === 'grammar') {
        const source = exerciseExampleSources[1]!;

        return {
            source,
            frozen: {
                kind: 'grammar',
                origin: { kind: 'block', blockId: source.id },
                rule,
            },
            text: rule,
        };
    }

    const source = exerciseExampleSources[2]!;

    return {
        source,
        frozen: {
            kind: 'text',
            origin: { kind: 'block', blockId: source.id },
            passages: [{ segmentId: uuid(20), text: passage }],
        },
        text: passage,
    };
}

function makeChecking(
    activity: ExerciseActivityMetadata,
    block: ExerciseLearningBlock,
    explanation: string,
): NamedExerciseChecking {
    const criteria: NamedExerciseRubric['criteria'] = [
        { dimension: 'task-completion' as const, requirement: block.question },
        {
            dimension: 'meaning' as const,
            requirement: 'Preserve the source meaning; do not invent facts.',
        },
    ];

    if (activity.category === 'vocabulary' || activity.category === 'grammar') {
        criteria.push({
            dimension: 'target-use',
            requirement:
                'Use the requested target words or grammar accurately.',
        });
    }

    if (activity.category === 'reading') {
        criteria.push({
            dimension: 'evidence',
            requirement: 'Support the answer with the supplied passage.',
        });
    }

    if (activity.checkingPolicy === 'ai-rubric') {
        return { policy: 'ai-rubric', rubric: { criteria } };
    }

    let key: Extract<NamedExerciseChecking, { policy: 'prepared-key' }>['key'];
    if (block.format === 'multiple-choice') {
        key = {
            kind: 'choice',
            correctChoiceId: block.correctChoiceId,
            explanations: block.choices.map((choice) => ({
                choiceId: choice.id,
                explanation,
            })),
        };

        if (activity.id === 'R03') {
            key.classification = {
                roles: block.choices.map((choice, index) => ({
                    choiceId: choice.id,
                    role: (['true', 'false', 'not-stated'] as const)[index]!,
                })),
                absenceRationale: explanation,
            };
        }
    } else if (block.format === 'fill-in-the-blank') {
        key = {
            kind: 'gaps',
            gaps: block.parts
                .filter((part) => part.kind === 'gap')
                .map((gap) => ({
                    gapId: gap.id,
                    acceptedAnswers: gap.acceptedAnswers,
                    explanation,
                })),
        };
    } else {
        key = { kind: 'text', acceptedAnswers: block.acceptedAnswers ?? [] };
    }

    if (activity.checkingPolicy === 'prepared-key') {
        return { policy: 'prepared-key', key };
    }

    return { policy: 'hybrid', key, rubric: { criteria } };
}

function interaction(
    activity: ExerciseActivityMetadata,
    spec: ExampleSpec,
    index: number,
    explanation: string,
): ExerciseLearningBlock {
    const base = {
        id: uuid(100 + index * 10),
        type: 'exercise' as const,
        question: spec.question,
        referenceAnswer: spec.answer,
        explanation,
        hint: explanation,
    };

    if (activity.format === 'multiple-choice') {
        const choices = spec.choices!.map((text, choiceIndex) => ({
            id: uuid(101 + index * 10 + choiceIndex),
            text,
        }));

        return {
            ...base,
            format: 'multiple-choice',
            choices,
            correctChoiceId: choices[spec.correctIndex ?? 0]!.id,
        };
    }

    if (activity.format === 'fill-in-the-blank') {
        return {
            ...base,
            format: 'fill-in-the-blank',
            parts: [
                { kind: 'text', text: spec.gap![0] },
                {
                    kind: 'gap',
                    id: uuid(101 + index * 10),
                    acceptedAnswers: [spec.answer],
                },
                { kind: 'text', text: spec.gap![1] },
            ],
        };
    }

    return {
        ...base,
        format: 'free-text',
        acceptedAnswers:
            activity.checkingPolicy === 'hybrid' || activity.id === 'L02'
                ? [spec.answer]
                : undefined,
    };
}

function sampleResponses(
    activity: ExerciseActivityMetadata,
    spec: ExampleSpec,
    locale: string,
): ExerciseActivityExample['sampleResponses'] {
    if (activity.checkingPolicy === 'prepared-key') {
        return [];
    }

    const copy = exampleFeedback(locale);
    const responses: ExerciseActivityExample['sampleResponses'] = [
        {
            id: 'successful',
            label: copy.labels[0],
            answer: spec.answer,
            evaluation: {
                status: 'correct',
                method: 'ai',
                feedback: copy.correct,
                suggestedAnswer: spec.answer,
            },
        },
    ];

    if (activity.checkingPolicy === 'ai-rubric') {
        responses.push({
            id: 'partial',
            label: copy.labels[1],
            answer: spec.partial!,
            evaluation: {
                status: 'partially-correct',
                method: 'ai',
                feedback: copy.partial,
                corrections: [copy.correction],
                suggestedAnswer: spec.answer,
            },
        });

        responses.push({
            id: 'unable',
            label: copy.labels[2],
            answer: '...',
            evaluation: {
                status: 'unable-to-assess',
                method: 'ai',
                feedback: copy.unable,
            },
        });
    }

    if (activity.id === 'R04') {
        responses.push({
            id: 'incorrect',
            label: copy.incorrectLabel,
            answer: 'She drives to a bookshop to buy three books.',
            evaluation: {
                status: 'incorrect',
                method: 'ai',
                feedback: copy.incorrectFeedback,
                corrections: [copy.incorrectCorrection],
                suggestedAnswer: spec.answer,
            },
        });
    }

    return responses;
}

export function exerciseActivityExamples(
    locale: string,
): ExerciseActivityExample[] {
    const language = exampleLocale(locale);
    const localeIndex = ['en', 'ru', 'fr', 'es'].indexOf(language);

    return exerciseActivityCatalog.map((activity, index) => {
        const spec = exampleSpecs[activity.id];
        const explanation = spec.reason[localeIndex]!;
        const source = frozenSource(activity);
        const block = interaction(activity, spec, index, explanation);
        if (source.frozen.kind === 'audio') {
            block.source = {
                blockId: source.source.id,
                segmentIds: source.frozen.passages.map(
                    (part) => part.segmentId!,
                ),
            };

            block.group = { id: uuid(24), parentBlockId: source.source.id };
        }

        block.title = activity.locales[language].name;
        block.semantics = {
            activity: { id: activity.id, version: 1 },
            objective: spec.question,
            language: activity.id === 'W01' ? 'fr' : 'en',
            explanationLanguage: language,
            format: activity.format,
            checking: makeChecking(activity, block, explanation),
            sources: [source.frozen],
        };

        return {
            activity,
            block,
            sources: [source.source],
            sourceText: source.text,
            ...(source.frozen.kind === 'audio'
                ? {
                      recording: {
                          block: libraryAudio,
                          url: '/workbook/library-dialogue.mp3',
                          excerpt: {
                              ...libraryAudio.transcript,
                              segments: libraryAudio.transcript.segments.filter(
                                  (segment) =>
                                      block.source?.segmentIds.includes(
                                          segment.id,
                                      ),
                              ),
                          },
                      },
                  }
                : {}),
            explanation,
            useCaseGuidance: activityUseCaseGuidance(activity.id, language),
            sampleResponses: sampleResponses(activity, spec, language),
        };
    });
}
