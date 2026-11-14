import { z } from 'zod';
import { ExerciseActivityIdSchema } from './exercise-activity';

const language = z
    .string()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u);

/** Learner choices only; references and authoring authority are resolved by the host. */
export const ExerciseGenerationRequestSchema = z
    .object({
        mode: z.enum(['automatic', 'selected']),
        count: z.number().int().min(1).max(25),
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
            .optional(),
        language,
        explanationLanguage: language,
        difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    })
    .strict()
    .superRefine((request, ctx) => {
        const activities = request.activities ?? [];
        if (
            (request.mode === 'automatic' && activities.length > 0) ||
            (request.mode === 'selected' &&
                (activities.length === 0 ||
                    activities.reduce((sum, item) => sum + item.count, 0) !==
                        request.count ||
                    new Set(activities.map((item) => item.activityId)).size !==
                        activities.length))
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['activities'],
                message:
                    'Selected activities must be distinct and exactly allocate the total; automatic mode has no allocations.',
            });
        }
    });

export type ExerciseGenerationRequest = z.infer<
    typeof ExerciseGenerationRequestSchema
>;
