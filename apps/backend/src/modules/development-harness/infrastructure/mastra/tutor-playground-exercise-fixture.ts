import { randomUUID } from 'node:crypto';
import {
    getExerciseActivity,
    type ExerciseActivityId,
    type NamedExerciseKey,
    type NamedExerciseRubric,
} from '@languon/contracts';
import type { LearningContentTask } from '../../../conversations/application/learning-content-contract';
import { exerciseActivitySequence } from '../../../conversations/application/exercise-activity-allocation';
import type { projectExerciseAuthoringSources } from '../../../conversations/infrastructure/ai/exercise-authoring-context';

type SourceProjection = ReturnType<typeof projectExerciseAuthoringSources>;

/** Fixed synthetic examples test the real authoring boundary, not language quality. */
export function playgroundExerciseBlocks(
    task: LearningContentTask,
    projection: SourceProjection,
): unknown[] {
    const selected = projection.tasks.find((item) => item.taskId === task.id);
    if (!selected) {
        throw new Error(
            'The synthetic exercise source projection is unavailable.',
        );
    }

    const sources = projection.blocks.filter((block) =>
        selected.blockIds.includes(block.id),
    );
    const excerpt = projection.excerpts.find(
        (item) => item.id === selected.selectionId,
    )?.text;
    const group = { id: randomUUID(), title: 'Synthetic named exercises' };

    return exerciseActivitySequence(task).map(({ activityId }, index) => {
        const activity = getExerciseActivity(activityId);
        const vocabulary = sources.find((block) => block.type === 'vocabulary');
        const grammar = sources.find((block) => block.type === 'grammar');
        const reading = sources.find(
            (block) => block.type === 'bilingual-text',
        );
        const entries = vocabulary?.entries ?? [];
        const entry = entries[index % entries.length];
        const words = entries.map((item) => item.term);
        const term = entry?.term ?? 'walk';
        const readingText = reading?.segments[0]?.text ?? excerpt;
        const sentence =
            readingText?.split(/(?<=[.!?])\s+/u)[0]?.slice(0, 400) ?? '';
        const sourceBindings =
            activity.category === 'vocabulary'
                ? [
                      {
                          kind: 'vocabulary',
                          blockId: vocabulary!.id,
                          entryIds:
                              activityId === 'V07'
                                  ? entries.map((item) => item.id)
                                  : [entry!.id],
                      },
                  ]
                : activity.category === 'grammar'
                  ? [{ kind: 'grammar', blockId: grammar!.id }]
                  : reading
                    ? [
                          {
                              kind: 'text',
                              blockId: reading.id,
                              segmentIds: [reading.segments[0]!.id],
                          },
                      ]
                    : [{ kind: 'text-selection' }];
        const scenario = exerciseScenario(
            activityId,
            term,
            entry?.definition ?? entry?.translation,
            words,
            sentence,
        );
        let key: NamedExerciseKey;
        let interaction;
        if (activity.format === 'multiple-choice') {
            const options = scenario.options!;
            const choices = options.map((text) => ({ id: randomUUID(), text }));
            const correctChoiceId = choices[0]!.id;
            key = {
                kind: 'choice',
                correctChoiceId,
                ...(activityId === 'R03'
                    ? {
                          classification: {
                              roles: choices.map((choice, index) => ({
                                  choiceId: choice.id,
                                  role: (
                                      ['true', 'false', 'not-stated'] as const
                                  )[index]!,
                              })),
                          },
                      }
                    : {}),
                explanations: choices.map((choice, choiceIndex) => ({
                    choiceId: choice.id,
                    explanation:
                        choiceIndex === 0
                            ? 'Supported by the selected synthetic material.'
                            : 'Does not express the selected synthetic meaning.',
                })),
            };

            interaction = { choices, correctChoiceId };
        } else if (activity.format === 'fill-in-the-blank') {
            const gapId = randomUUID();
            key = {
                kind: 'gaps',
                gaps: [
                    {
                        gapId,
                        acceptedAnswers: [scenario.answer],
                        explanation:
                            'The selected source supplies this synthetic answer.',
                    },
                ],
            };

            interaction = {
                parts: [
                    {
                        kind: 'text',
                        text:
                            scenario.beforeGap ??
                            'Complete this synthetic example: ',
                    },
                    {
                        kind: 'gap',
                        id: gapId,
                        acceptedAnswers: [scenario.answer],
                    },
                    { kind: 'text', text: scenario.afterGap ?? '.' },
                ],
            };
        } else {
            key = { kind: 'text', acceptedAnswers: [scenario.answer] };
            interaction =
                activity.checkingPolicy === 'hybrid'
                    ? { acceptedAnswers: [scenario.answer] }
                    : {};
        }

        const criteria: NamedExerciseRubric['criteria'] = [
            {
                dimension: 'task-completion',
                requirement: 'Complete the stated synthetic task.',
            },
            {
                dimension: 'meaning',
                requirement:
                    'Preserve the meaning of the selected synthetic material.',
            },
        ];

        if (
            activity.category === 'vocabulary' ||
            activity.category === 'grammar'
        ) {
            criteria.push({
                dimension: 'target-use',
                requirement:
                    'Use the selected word or grammar requirement accurately.',
            });
        } else if (activity.category === 'reading') {
            criteria.push({
                dimension: 'evidence',
                requirement:
                    'Support the response using the selected source text.',
            });
        }

        const checking =
            activity.checkingPolicy === 'prepared-key'
                ? { policy: activity.checkingPolicy, key }
                : activity.checkingPolicy === 'hybrid'
                  ? {
                        policy: activity.checkingPolicy,
                        key,
                        rubric: { criteria },
                    }
                  : { policy: activity.checkingPolicy, rubric: { criteria } };

        return {
            id: randomUUID(),
            type: 'exercise',
            group,
            format: activity.format,
            question: `${scenario.question}${
                activityId === 'V01'
                    ? ''
                    : ` Source vocabulary: ${words.join(', ')}.`
            } (Synthetic item ${index + 1}.)`,
            referenceAnswer: scenario.answer,
            explanation:
                'Synthetic fixture feedback. Inspect the selected source; live mode is required for language-quality testing.',
            hint: 'Review the selected material.',
            ...interaction,
            semantics: {
                activity: { id: activityId, version: 1 },
                objective: `Practise ${activity.locales.en.name} with synthetic data.`,
                language: task.language,
                explanationLanguage: task.explanationLanguage ?? task.language,
                format: activity.format,
                checking,
            },
            sourceBindings,
        };
    });
}

function exerciseScenario(
    id: ExerciseActivityId,
    term: string,
    sense: string | undefined,
    words: string[],
    sentence: string,
): {
    question: string;
    answer: string;
    options?: string[];
    beforeGap?: string;
    afterGap?: string;
} {
    switch (id) {
        case 'V01':
            return {
                question:
                    'Recall the selected source word from its position and meaning.',
                answer: term,
            };
        case 'V02':
            return {
                question: `Which source meaning belongs to “${term}”?`,
                answer: sense!,
                options: [sense!, 'An unrelated synthetic meaning.'],
            };
        case 'V03':
            return {
                question: 'Complete the sentence using a selected source word.',
                answer: term,
                beforeGap: 'The selected learning topic is ',
            };
        case 'V05':
            return {
                question: 'Complete this source-based word pair.',
                answer: term,
                beforeGap: 'Study the ',
            };
        case 'V06':
            return {
                question: `Complete the phrase with the dictionary form of “${term}”.`,
                answer: term,
                beforeGap: 'We study the ',
            };
        case 'V07':
            return {
                question: `Use these selected source words in a sentence: ${words.join(', ')}.`,
                answer: `We study ${words.join(', ')}.`,
            };
        case 'G01':
            return {
                question:
                    'Choose the form that agrees with I in this repeated-action example.',
                answer: 'walk',
                options: ['walk', 'walks'],
            };
        case 'G02':
            return {
                question: 'Complete the repeated-action example using walk.',
                answer: 'walk',
                beforeGap: 'I ',
                afterGap: ' every day.',
            };
        case 'G03':
            return {
                question:
                    'Rewrite “I go for walks daily” using the source grammar.',
                answer: 'I walk every day.',
            };
        case 'G04':
            return {
                question: 'Correct the agreement error: “I walks every day.”',
                answer: 'I walk every day.',
            };
        case 'G06':
            return {
                question:
                    'What does “I walk every day” mean in the selected grammar example?',
                answer: 'A repeated action.',
                options: ['A repeated action.', 'One completed event.'],
            };
        case 'G07':
            return {
                question:
                    'Describe a daily habit using the selected grammar rule.',
                answer: 'I walk every day.',
            };
        case 'R01':
            return {
                question:
                    'Choose a source-supported statement describing this synthetic reading.',
                answer: sentence,
                options: [sentence, 'No source event is described.'],
            };
        case 'R02':
            return {
                question: 'Which detail is explicitly stated in this source?',
                answer: sentence,
                options: [sentence, 'The passage contains no factual detail.'],
            };
        case 'R03':
            return {
                question: `True, false or not stated: the source includes this statement: ${sentence}`,
                answer: 'True',
                options: ['True', 'False', 'Not stated'],
            };
        case 'R04':
            return {
                question:
                    'Explain one fact stated in the source in your own words.',
                answer: sentence,
            };
        case 'R08': {
            const [first = '', ...rest] = sentence.split(/\s+/u);

            return {
                question: 'Complete this source-based summary cue.',
                answer: first,
                beforeGap: 'The source starts with: ',
                afterGap: ` ${rest.join(' ')}`,
            };
        }

        case 'R09':
            return {
                question: 'Summarize the selected reading.',
                answer: sentence,
            };
        case 'W01':
            return {
                question:
                    'Translate the meaning of the selected source sentence. This deterministic example does not assess translation quality.',
                answer: sentence,
            };
    }
}
