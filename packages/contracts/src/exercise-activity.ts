import { z } from 'zod';

export const ExerciseActivityIdSchema = z.enum([
    'V01',
    'V02',
    'V03',
    'V05',
    'V06',
    'V07',
    'G01',
    'G02',
    'G03',
    'G04',
    'G06',
    'G07',
    'R01',
    'R02',
    'R03',
    'R04',
    'R08',
    'R09',
    'W01',
]);

/** Pedagogical material kinds do not establish ownership or source access. */
export const ExerciseActivitySourceKindSchema = z.enum([
    'vocabulary',
    'grammar',
    'text',
]);

export const ExerciseCheckingPolicySchema = z.enum([
    'prepared-key',
    'hybrid',
    'ai-rubric',
]);

export const ExerciseActivityFormatSchema = z.enum([
    'multiple-choice',
    'fill-in-the-blank',
    'free-text',
]);

const displayText = (max: number) =>
    z
        .string()
        .min(1)
        .max(max)
        .refine(
            (value) =>
                value.trim().length > 0 &&
                !/[\uD800-\uDFFF]/u.test(value) &&
                !value.includes('\u0000'),
            'Expected nonempty valid Unicode text.',
        );

const localizedDisplay = z
    .object({
        name: displayText(200),
        description: displayText(500),
        example: displayText(1_000),
    })
    .strict()
    .readonly();

/** Display contracts exclude generation instructions, model schemas and authority. */
export const ExerciseActivityMetadataSchema = z
    .object({
        id: ExerciseActivityIdSchema,
        version: z.literal(1),
        category: z.enum(['vocabulary', 'grammar', 'reading', 'writing']),
        format: ExerciseActivityFormatSchema,
        checkingPolicy: ExerciseCheckingPolicySchema,
        supportedSourceKinds: z
            .array(ExerciseActivitySourceKindSchema)
            .min(1)
            .max(3)
            .refine(
                (kinds) => new Set(kinds).size === kinds.length,
                'Source kinds must be unique.',
            )
            .readonly(),
        locales: z
            .object({
                en: localizedDisplay,
                ru: localizedDisplay,
                fr: localizedDisplay,
                es: localizedDisplay,
            })
            .strict()
            .readonly(),
    })
    .strict()
    .readonly();

export type ExerciseActivityId = z.infer<typeof ExerciseActivityIdSchema>;
export type ExerciseActivitySourceKind = z.infer<
    typeof ExerciseActivitySourceKindSchema
>;
export type ExerciseCheckingPolicy = z.infer<
    typeof ExerciseCheckingPolicySchema
>;
export type ExerciseActivityFormat = z.infer<
    typeof ExerciseActivityFormatSchema
>;
export type ExerciseActivityMetadata = z.infer<
    typeof ExerciseActivityMetadataSchema
>;
