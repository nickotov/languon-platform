import { randomUUID } from 'node:crypto';
import type { LearningBlock, ExerciseActivityId } from '@languon/contracts';
import { namedExerciseFixture } from './named-exercise-fixture';

/** Ordered provider responses. Metadata, billing and every checkpoint are created by the real worker. */
export function firstReadingReplies(
    fullLesson: boolean,
    rejectRepair: boolean,
) {
    const passage = 'Les citoyens consultent les élus du conseil municipal.';
    const reading = {
        id: randomUUID(),
        type: 'bilingual-text' as const,
        language: 'fr',
        translations: [],
        segments: [{ id: randomUUID(), text: passage }],
    };
    const grammar = {
        id: randomUUID(),
        type: 'grammar' as const,
        language: 'fr',
        rule: 'Un COD peut devenir sujet à la voix passive. Un COI conserve sa préposition.',
    };
    const checks = (
        taskId: string,
        activities: ExerciseActivityId[],
        source: LearningBlock,
    ) =>
        activities.map((activityId, index) => {
            const block = namedExerciseFixture({
                activityId,

                sources: [source],
            });

            return JSON.stringify({
                tasks: [
                    {
                        taskId,
                        blocks: [
                            {
                                ...block,
                                question: `${block.question} (${index + 1})`,
                                sourceBindings:
                                    source.type === 'bilingual-text'
                                        ? [{ kind: 'text-selection' }]
                                        : block.sourceBindings,
                            },
                        ],
                    },
                ],
            });
        });
    const readingIds: ExerciseActivityId[] = fullLesson
        ? ['R01', 'R08', 'R04']
        : ['R04'];
    const plan = {
        kind: 'generate',
        replyLanguage: 'en',
        brief: {
            tasks: [
                {
                    id: 'reading',
                    kind: 'prose',
                    language: 'fr',
                    instruction: 'Write a French reading on democracy.',
                },
                {
                    id: 'practice',
                    kind: 'exercises',
                    language: 'fr',
                    explanationLanguage: 'fr',
                    instruction: 'Check understanding of the reading.',
                    source: { kind: 'task', taskId: 'reading' },
                    count: readingIds.length,
                    activities: readingIds.map((activityId) => ({
                        activityId,
                        count: 1,
                    })),
                },
                ...(fullLesson
                    ? [
                          {
                              id: 'grammar',
                              kind: 'grammar',
                              language: 'fr',
                              explanationLanguage: 'fr',
                              instruction:
                                  'Explain COD, COI and the passive voice.',
                          },
                          {
                              id: 'grammar-check',
                              kind: 'exercises',
                              language: 'fr',
                              explanationLanguage: 'fr',
                              instruction:
                                  'Check recognition and use of COD and COI.',
                              source: { kind: 'task', taskId: 'grammar' },
                              count: 5,
                              activities: [
                                  { activityId: 'G01', count: 2 },
                                  { activityId: 'G02', count: 2 },
                                  { activityId: 'G03', count: 1 },
                              ],
                          },
                      ]
                    : []),
            ],
            outputOrder: fullLesson
                ? ['reading', 'practice', 'grammar', 'grammar-check']
                : ['reading', 'practice'],
        },
    };

    return {
        passage,
        replies: [
            JSON.stringify(plan),
            'invalid first prose candidate',
            ...(rejectRepair ? ['invalid second prose candidate'] : []),
            JSON.stringify({
                tasks: [
                    {
                        taskId: 'reading',
                        prose: [{ kind: 'paragraph', text: passage }],
                    },
                ],
            }),
            ...checks('practice', readingIds, reading),
            ...(fullLesson
                ? [
                      JSON.stringify({
                          tasks: [{ taskId: 'grammar', blocks: [grammar] }],
                      }),
                      ...checks(
                          'grammar-check',
                          ['G01', 'G01', 'G02', 'G02', 'G03'],
                          grammar,
                      ),
                  ]
                : []),
        ],
    };
}

/** Respond to the actual selected task so that independent tasks may run in any order. */
export function frenchLessonRecoveryProvider(exhaust: boolean) {
    const { replies, passage } = firstReadingReplies(true, false);
    const authorReplies = replies
        .slice(2)
        .map((reply) => JSON.parse(reply).tasks[0]);
    const requests: Array<{
        taskId: string;
        ordinal: number;
        strategy: string;
        grounded: boolean;
    }> = [];

    function respond(body: {
        messages: Array<{ content: string | Array<{ text?: string }> }>;
    }) {
        const prompt = body.messages
            .flatMap(({ content }) =>
                typeof content === 'string'
                    ? [content]
                    : content.map((part) => part.text ?? ''),
            )
            .join('\n');
        const field = (marker: string) =>
            prompt.split(marker)[1]?.split('\n')[0];
        const brief = field(
            'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
        );

        if (!brief) {
            requests.push({
                taskId: 'plan',
                ordinal: 1,
                strategy: 'plan',
                grounded: true,
            });

            return replies[0]!;
        }

        const [taskBrief] = JSON.parse(brief).tasks as Array<{ id: string }>;
        if (!taskBrief) {
            throw new Error('The provider fixture requires a selected task.');
        }

        const { id } = taskBrief;
        const progress = JSON.parse(
            field('Exercise batch progress (host-controlled data): ') ?? 'null',
        );
        const ordinal = Number(progress?.offset ?? 0) + 1;
        const task = authorReplies.filter(
            (candidate) => candidate.taskId === id,
        )[ordinal - 1];

        if (!task) {
            throw new Error('Unplanned synthetic lesson dispatch.');
        }

        const fallback = prompt.includes(
            'Independent compact authoring strategy',
        );
        const strategy = fallback
            ? 'fallback'
            : prompt.includes(
                    'The previous completed candidate failed validation',
                )
              ? 'repair'
              : 'initial';
        const grounded =
            id === 'practice'
                ? prompt.includes(passage)
                : id === 'grammar-check'
                  ? prompt.includes('Un COD peut devenir sujet')
                  : true;

        requests.push({ taskId: id, ordinal, strategy, grounded });

        if (id === 'practice' && ordinal === 3 && (!fallback || exhaust)) {
            const invalid = structuredClone(task.blocks[0]);
            delete invalid.rubric.evidence;

            return JSON.stringify(
                fallback
                    ? { item: invalid }
                    : { tasks: [{ ...task, blocks: [invalid] }] },
            );
        }

        return JSON.stringify(
            fallback ? { item: task.blocks[0] } : { tasks: [task] },
        );
    }

    return { respond, requests };
}
