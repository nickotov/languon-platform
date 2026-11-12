import { z } from 'zod';

export const TutorPlaygroundScenarioSchema = z.enum([
    'empty-owned',
    'vocabulary-follow-up',
    'grammar-revision',
    'missing-language',
    'ambiguous',
    'read-only',
]);
export const TutorPlaygroundContextSchema = z
    .object({
        scenarioId: TutorPlaygroundScenarioSchema.default('empty-owned'),
        sessionId: z.uuid().optional(),
    })
    .strict();
export const TutorPlaygroundTurnInputSchema =
    TutorPlaygroundContextSchema.extend({
        message: z.string().trim().min(1).max(4_000),
    }).strict();
export const TutorPlaygroundReadInputSchema = z
    .object({
        sessionId: z.uuid(),
        proposalId: z.uuid(),
    })
    .strict();
export type TutorPlaygroundContext = z.infer<
    typeof TutorPlaygroundContextSchema
>;
export type TutorPlaygroundTurnInput = z.infer<
    typeof TutorPlaygroundTurnInputSchema
>;
