import { z } from 'zod';
import {
    ExerciseActivityIdSchema,
    getExerciseActivity,
    type LearningBlockProposalInput,
} from '@languon/contracts';
import { serializeLearningContentBrief } from './learning-content-transport';
import { planLearningContentBatches } from './learning-content-batches';

const language = z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u);

export const LearningContentSourceSchema = z.discriminatedUnion('kind', [
    z
        .object({ kind: z.literal('editor'), blockId: z.uuid().optional() })
        .strict(),
    z.object({ kind: z.literal('selection') }).strict(),
    z
        .object({
            kind: z.literal('task'),
            taskId: z.string().trim().min(1).max(80),
        })
        .strict(),
    z
        .object({
            kind: z.literal('proposal'),
            proposalId: z.uuid(),
            blockId: z.uuid().optional(),
        })
        .strict(),
]);

export const LearningContentTaskSchema = z
    .object({
        id: z.string().trim().min(1).max(80),
        kind: z.enum(['vocabulary', 'grammar', 'bilingual-text', 'exercises']),
        source: LearningContentSourceSchema.optional(),
        instruction: z.string().trim().min(1).max(4_000),
        language: language.optional(),
        translationLanguage: language.optional(),
        explanationLanguage: language.optional(),
        activities: z
            .array(
                z
                    .object({
                        activityId: ExerciseActivityIdSchema,
                        count: z.number().int().min(1).max(25).optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(19)
            .optional(),
        words: z
            .array(z.string().trim().min(1).max(500))
            .min(1)
            .max(200)
            .optional(),
        sourceText: z
            .string()
            .min(1)
            .max(40_000)
            .refine((value) => value.trim().length > 0)
            .optional(),
        count: z.number().int().min(1).max(200).optional(),
        formats: z
            .array(z.string().trim().min(1).max(80))
            .min(1)
            .max(3)
            .optional(),
        difficulty: z.string().trim().min(1).max(100).optional(),
    })
    .strict();

export const LearningContentBriefSchema = z
    .object({
        tasks: z.array(LearningContentTaskSchema).min(1).max(8),
    })
    .strict()
    .refine(
        ({ tasks }) =>
            new Set(tasks.map((task) => task.id)).size === tasks.length,
        'Task identities must be unique.',
    )
    .refine(
        (brief) => serializeLearningContentBrief(brief).length <= 60_000,
        'The generation brief is too large.',
    );

export type LearningContentTask = z.infer<typeof LearningContentTaskSchema>;
export type LearningContentBrief = z.infer<typeof LearningContentBriefSchema>;

export const LearningContentLimitationCodeSchema = z.enum([
    'single-block-task',
    'exercise-format-only',
    'unsupported-exercise-format',
    'block-limit',
    'word-count-conflict',
    'output-capacity',
    'activity-count-conflict',
    'activity-prerequisite',
    'task-dependency',
]);
export type LearningContentLimitationCode = z.infer<
    typeof LearningContentLimitationCodeSchema
>;

export type LearningContentResult =
    | { status: 'ready'; proposal: LearningBlockProposalInput; summary: string }
    | {
          status: 'needs-clarification';
          missing: { taskId: string; fields: string[] }[];
          code?: LearningContentLimitationCode;
      }
    | {
          status: 'unsupported';
          code: LearningContentLimitationCode;
          reason: string;
      }
    | { status: 'failed'; reason: 'invalid-brief' | 'invalid-output' };

export const supportedLearningExerciseFormats = [
    'multiple-choice',
    'fill-in-the-blank',
    'free-text',
] as const;

/** Capability descriptions are data consumed by routing and authoring, not permissions. */
export const learningContentCapabilities = [
    {
        kind: 'vocabulary',
        toolId: 'generate_vocabulary',
        renderer: 'vocabulary',
        required: ['language', 'translationLanguage'],
        defaultCount: 10,
        instruction:
            'Create one vocabulary block. Preserve supplied words exactly and in order; include every supplied word and no additional entries. Translate each entry and provide useful examples.',
    },
    {
        kind: 'grammar',
        toolId: 'generate_grammar',
        renderer: 'grammar',
        required: ['language'],
        defaultCount: 1,
        instruction:
            'Create one grammar block with a clear rule, formation pattern, useful examples and common mistakes when relevant. Explain in the requested explanation language. Do not include exercises inside prose.',
    },
    {
        kind: 'bilingual-text',
        toolId: 'generate_bilingual_text',
        renderer: 'bilingual-text',
        required: ['language', 'translationLanguage'],
        defaultCount: 1,
        instruction:
            'Create one bilingual-text block. Preserve supplied source wording and align every translated segment to its source segment exactly once. When only a topic is provided, author a concise original text.',
    },
    {
        kind: 'exercises',
        toolId: 'generate_exercises',
        renderer: 'exercise',
        required: ['language'],
        defaultCount: 5,
        formats: supportedLearningExerciseFormats,
        instruction:
            'Create individual exercise blocks with a shared group, reference answers, short explanations and useful hints. Cover the supplied words and source material. Preserve exact activity allocations, count and order. Every generated exercise must retain its named activity semantics, checking policy and exact source provenance. Keep answers out of questions and hints.',
    },
] as const;

export function learningContentRequirements(
    brief: LearningContentBrief,
): LearningContentResult | null {
    const missing: { taskId: string; fields: string[] }[] = [];
    let blockCount = 0;
    let hasWordConflict = false;

    for (const [taskIndex, task] of brief.tasks.entries()) {
        const capability = learningContentCapabilities.find(
            (item) => item.kind === task.kind,
        )!;
        const fields = capability.required.filter((field) => !task[field]);
        if (fields.length) {
            missing.push({ taskId: task.id, fields: [...fields] });
        }

        if (task.source?.kind === 'task') {
            const sourceId = task.source.taskId;
            const sourceTask = brief.tasks.find(
                (candidate) => candidate.id === sourceId,
            );
            const sourceIndex = brief.tasks.findIndex(
                (candidate) => candidate.id === sourceId,
            );

            if (
                !sourceTask ||
                sourceIndex >= taskIndex ||
                sourceTask.kind === 'exercises'
            ) {
                return {
                    status: 'needs-clarification',
                    code: 'task-dependency',
                    missing: [{ taskId: task.id, fields: ['source'] }],
                };
            }
        }

        if (
            task.source &&
            task.source.kind !== 'task' &&
            task.kind !== 'exercises' &&
            !task.sourceText
        ) {
            missing.push({ taskId: task.id, fields: ['sourceText'] });
        }

        if (task.kind === 'vocabulary' && task.words) {
            const words = task.words.map((word) => word.normalize('NFKC'));
            const conflictingWords = new Set(words).size !== words.length;
            const conflictingCount =
                task.count !== undefined && task.count !== words.length;

            if (conflictingWords || conflictingCount) {
                hasWordConflict = true;
                missing.push({
                    taskId: task.id,
                    fields: conflictingCount ? ['words', 'count'] : ['words'],
                });
            }
        }

        if (
            (task.kind === 'grammar' || task.kind === 'bilingual-text') &&
            task.count !== undefined &&
            task.count !== 1
        ) {
            return {
                status: 'unsupported',
                code: 'single-block-task',
                reason: 'A grammar or bilingual-text task creates one block. Use separate tasks for several blocks.',
            };
        }

        if (task.kind !== 'exercises' && (task.formats || task.activities)) {
            return {
                status: 'unsupported',
                code: 'exercise-format-only',
                reason: 'Exercise activities and formats apply only to exercise tasks.',
            };
        }

        if (task.kind === 'exercises') {
            const activities = task.activities;
            if (activities) {
                const total = activities.reduce(
                    (sum, activity) => sum + (activity.count ?? 0),
                    0,
                );
                const hasMissingCounts =
                    activities.length > 1 &&
                    activities.some((activity) => activity.count === undefined);

                if (
                    new Set(activities.map((activity) => activity.activityId))
                        .size !== activities.length ||
                    hasMissingCounts ||
                    (task.count !== undefined &&
                        total > 0 &&
                        total !== task.count)
                ) {
                    return {
                        status: 'needs-clarification',
                        code: 'activity-count-conflict',
                        missing: [
                            {
                                taskId: task.id,
                                fields: ['activities', 'count'],
                            },
                        ],
                    };
                }
            } else if (
                !task.source &&
                !task.sourceText &&
                !task.words?.length
            ) {
                missing.push({ taskId: task.id, fields: ['source'] });
            }

            if (
                activities &&
                task.formats &&
                activities.some(
                    (activity) =>
                        !task.formats!.includes(
                            getExerciseActivity(activity.activityId).format,
                        ),
                )
            ) {
                return {
                    status: 'needs-clarification',
                    code: 'activity-prerequisite',
                    missing: [
                        { taskId: task.id, fields: ['activities', 'formats'] },
                    ],
                };
            }

            const formats = task.formats ?? supportedLearningExerciseFormats;
            if (
                formats.some(
                    (format) =>
                        !supportedLearningExerciseFormats.some(
                            (supported) => supported === format,
                        ),
                ) ||
                new Set(formats).size !== formats.length
            ) {
                return {
                    status: 'unsupported',
                    code: 'unsupported-exercise-format',
                    reason: 'Choose supported, distinct exercise formats: multiple-choice, fill-in-the-blank or free-text.',
                };
            }
        }

        blockCount +=
            task.kind === 'exercises'
                ? (task.count ??
                  (task.activities?.every(
                      (activity) => activity.count !== undefined,
                  )
                      ? task.activities.reduce(
                            (sum, activity) => sum + activity.count!,
                            0,
                        )
                      : capability.defaultCount))
                : 1;
    }

    if (blockCount > 25) {
        return {
            status: 'unsupported',
            code: 'block-limit',
            reason: 'This request exceeds the 25-block proposal limit. Split it into smaller requests.',
        };
    }

    if (!missing.length && !planLearningContentBatches(brief)) {
        return {
            status: 'unsupported',
            code: 'output-capacity',
            reason: 'The complete requested content exceeds the bounded request allowance. Split the request or use shorter source material.',
        };
    }

    return missing.length
        ? {
              status: 'needs-clarification',
              missing,
              ...(hasWordConflict
                  ? { code: 'word-count-conflict' as const }
                  : {}),
          }
        : null;
}
