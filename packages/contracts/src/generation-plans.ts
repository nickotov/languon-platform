import { z } from 'zod';
import { ExerciseActivityIdSchema } from './exercise-activity';
import { getExerciseActivity } from './exercise-activity-catalog';

import { LessonTaskIdSchema as identity } from './lesson-part-identity';

const language = z
    .string()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u);
const instruction = z
    .string()
    .trim()
    .min(1)
    .max(4_000)
    .refine(
        (value) => !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000'),
        'Expected valid Unicode text.',
    );

export const GenerationTaskKindSchema = z.enum([
    'prose',
    'vocabulary',
    'grammar',
    'bilingual-text',
    'exercises',
]);
export const GenerationSourceKindSchema = z.enum([
    'text',
    'vocabulary',
    'grammar',
]);

/** References select material already authorized by the host; they confer no access. */
export const GenerationPlanSourceSchema = z
    .object({
        id: identity,
        kind: GenerationSourceKindSchema,
        reference: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('block'), blockId: z.uuid() }).strict(),
            z.object({ kind: z.literal('selection') }).strict(),
            z
                .object({
                    kind: z.literal('provided-text'),
                    materialId: z.uuid(),
                })
                .strict(),
            z
                .object({
                    kind: z.literal('proposal'),
                    proposalId: z.uuid(),
                    blockId: z.uuid(),
                })
                .strict(),
        ]),
    })
    .strict()
    .refine(
        (source) =>
            !['selection', 'provided-text'].includes(source.reference.kind) ||
            source.kind === 'text',
        'A selection or provided text is a text source.',
    );

export const GenerationTaskInputSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('source'), sourceId: identity }).strict(),
    z.object({ kind: z.literal('task'), taskId: identity }).strict(),
]);

const inputs = z
    .array(GenerationTaskInputSchema)
    .max(8)
    .refine(
        (items) =>
            new Set(items.map((item) => JSON.stringify(item))).size ===
            items.length,
        'Task inputs must be distinct.',
    );
const taskFields = {
    id: identity,
    instruction,
    language,
    inputs,
    difficulty: z.string().trim().min(1).max(100).optional(),
};
const materialFields = {
    ...taskFields,
    sourceText: z.string().min(1).max(40_000).optional(),
};
const targetWords = z.number().int().min(1).max(1_200).optional();

/** Complete executable requirements; clarification drafts remain application-owned. */
export const GenerationTaskSchema = z.discriminatedUnion('kind', [
    z
        .object({ ...materialFields, kind: z.literal('prose'), targetWords })
        .strict(),
    z
        .object({
            ...materialFields,
            kind: z.literal('vocabulary'),
            translationLanguage: language,
            count: z.number().int().min(1).max(200),
            words: z
                .array(z.string().trim().min(1).max(500))
                .min(1)
                .max(200)
                .optional(),
        })
        .strict(),
    z
        .object({
            ...materialFields,
            kind: z.literal('grammar'),
            explanationLanguage: language,
        })
        .strict(),
    z
        .object({
            ...materialFields,
            kind: z.literal('bilingual-text'),
            translationLanguage: language,
            targetWords,
        })
        .strict(),
    z
        .object({
            ...taskFields,
            kind: z.literal('exercises'),
            explanationLanguage: language,
            inputs: inputs.refine(
                (items) => items.length > 0,
                'Exercises require source material.',
            ),
            activities: z
                .array(
                    z
                        .object({
                            activityId: ExerciseActivityIdSchema,
                            count: z.number().int().min(1).max(25),
                        })
                        .strict(),
                )
                .min(1)
                .max(19)
                .refine(
                    (activities) =>
                        new Set(
                            activities.map((activity) => activity.activityId),
                        ).size === activities.length,
                    'Activity counts must be combined per format.',
                ),
        })
        .strict(),
]);

export type GenerationTask = z.infer<typeof GenerationTaskSchema>;
export type GenerationTaskInput = z.infer<typeof GenerationTaskInputSchema>;
export type GenerationPlanSource = z.infer<typeof GenerationPlanSourceSchema>;

function taskSourceKind(task: GenerationTask) {
    if (task.kind === 'prose' || task.kind === 'bilingual-text') {
        return 'text';
    }

    return task.kind === 'exercises' ? undefined : task.kind;
}

export const GenerationPlanSchema = z
    .object({
        schemaVersion: z.literal(1),
        replyLanguage: language,
        sources: z.array(GenerationPlanSourceSchema).max(32),
        tasks: z.array(GenerationTaskSchema).min(1).max(8),
        outputOrder: z.array(identity).min(1).max(8),
    })
    .strict()
    .superRefine((plan, ctx) => {
        const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
        const sources = new Map(
            plan.sources.map((source) => [source.id, source]),
        );
        const issue = (path: (string | number)[], message: string) =>
            ctx.addIssue({ code: 'custom', path, message });

        if (tasks.size !== plan.tasks.length) {
            issue(['tasks'], 'Task identities must be unique.');
        }

        if (sources.size !== plan.sources.length) {
            issue(['sources'], 'Source identities must be unique.');
        }

        if (
            plan.outputOrder.length !== tasks.size ||
            new Set(plan.outputOrder).size !== tasks.size ||
            plan.outputOrder.some((id) => !tasks.has(id))
        ) {
            issue(
                ['outputOrder'],
                'Output order must contain every task exactly once.',
            );
        }

        let blockCount = 0;
        for (const [index, task] of plan.tasks.entries()) {
            const sourceKinds: z.infer<typeof GenerationSourceKindSchema>[] =
                [];

            blockCount +=
                task.kind === 'prose'
                    ? 0
                    : task.kind === 'exercises'
                      ? task.activities.reduce(
                            (sum, activity) => sum + activity.count,
                            0,
                        )
                      : 1;

            for (const [inputIndex, input] of task.inputs.entries()) {
                const path = ['tasks', index, 'inputs', inputIndex];
                const dependency =
                    input.kind === 'task' ? tasks.get(input.taskId) : undefined;
                const sourceKind =
                    input.kind === 'source'
                        ? sources.get(input.sourceId)?.kind
                        : dependency && taskSourceKind(dependency);

                if (!sourceKind) {
                    issue(
                        path,
                        'Input must reference existing compatible source material.',
                    );

                    continue;
                }

                sourceKinds.push(sourceKind);
            }

            if (
                task.kind === 'exercises' &&
                task.activities.some(
                    (activity) =>
                        !sourceKinds.some((kind) =>
                            getExerciseActivity(
                                activity.activityId,
                            ).supportedSourceKinds.includes(kind),
                        ),
                )
            ) {
                issue(
                    ['tasks', index, 'inputs'],
                    'Every requested activity needs compatible source material.',
                );
            }
        }

        if (blockCount > 25) {
            issue(['tasks'], 'A plan may produce at most 25 custom blocks.');
        }

        // Dependency traversal does not constrain presentation order.
        const visiting = new Set<string>();
        const visited = new Set<string>();
        const visit = (id: string): boolean => {
            if (visiting.has(id)) {
                return false;
            }

            if (visited.has(id)) {
                return true;
            }

            visiting.add(id);
            for (const input of tasks.get(id)?.inputs ?? []) {
                if (input.kind === 'task' && !visit(input.taskId)) {
                    return false;
                }
            }

            visiting.delete(id);
            visited.add(id);

            return true;
        };

        if (plan.tasks.some((task) => !visit(task.id))) {
            issue(['tasks'], 'Task dependencies must be acyclic.');
        }

        if (JSON.stringify(plan).length > 60_000) {
            issue([], 'The generation plan is too large.');
        }
    });

export type GenerationPlan = z.infer<typeof GenerationPlanSchema>;
