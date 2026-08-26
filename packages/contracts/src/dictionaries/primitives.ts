import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';
import { z } from 'zod';

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const CAPABILITY_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]+$/;

function hasUnsafeControlCharacter(value: string): boolean {
    return Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);

        return (
            codePoint !== undefined &&
            (codePoint <= 8 ||
                codePoint === 11 ||
                codePoint === 12 ||
                (codePoint >= 14 && codePoint <= 31) ||
                codePoint === 127)
        );
    });
}

function boundedText(options: {
    maxCodePoints: number;
    minCodePoints?: number;
    trim?: boolean;
}) {
    const { maxCodePoints, minCodePoints = 0, trim = false } = options;
    const base = trim ? z.string().trim() : z.string();

    return base.superRefine((value, context) => {
        const length = Array.from(value).length;

        if (length < minCodePoints) {
            context.addIssue({
                code: 'custom',
                message: `Value must contain at least ${minCodePoints} Unicode code point${minCodePoints === 1 ? '' : 's'}`,
            });
        }

        if (length > maxCodePoints) {
            context.addIssue({
                code: 'custom',
                message: `Value must contain at most ${maxCodePoints} Unicode code points`,
            });
        }

        if (hasUnsafeControlCharacter(value)) {
            context.addIssue({
                code: 'custom',
                message: 'Value contains an unsupported control character',
            });
        }
    });
}

export const DictionaryIdSchema = z.uuid();
export const DictionaryCardIdSchema = DictionaryIdSchema;
export const DictionaryTimestampSchema = z.iso.datetime({ offset: true });
export const DictionaryVersionSchema = z.number().int().positive();
export const DictionaryLanguageTagSchema = z.enum(SUPPORTED_LANGUAGE_TAGS);
export const DictionaryLanguageRoleSchema = z.enum(['source', 'target']);
export const DictionaryVisibilitySchema = z.enum(['private', 'unlisted']);
export const DictionaryLifecycleSchema = z.enum(['active', 'archived']);
export const DictionaryAuthorshipSchema = z.enum([
    'human',
    'ai-generated',
    'mixed',
]);
export const DictionaryNotationSchema = z.enum([
    'ipa',
    'romanization',
    'custom',
]);
export const DictionaryEnableOverrideSchema = z
    .enum(['enabled', 'disabled'])
    .nullable();

export const DictionaryNameSchema = boundedText({
    minCodePoints: 1,
    maxCodePoints: 120,
    trim: true,
});
export const DictionaryDescriptionSchema = boundedText({
    maxCodePoints: 2_000,
    trim: true,
});
export const DictionaryCustomNotationLabelSchema = boundedText({
    minCodePoints: 1,
    maxCodePoints: 40,
    trim: true,
});
export const DictionaryCardPrimaryValueSchema = boundedText({
    minCodePoints: 1,
    maxCodePoints: 200,
    trim: true,
});
export const DictionaryCardOptionalValueSchema = boundedText({
    maxCodePoints: 2_000,
});
export const DictionaryGenerationInstructionSchema = boundedText({
    minCodePoints: 1,
    maxCodePoints: 1_000,
    trim: true,
});
export const DictionaryGenerationFeedbackTextSchema = boundedText({
    minCodePoints: 1,
    maxCodePoints: 500,
    trim: true,
});
export const DictionarySearchSchema = boundedText({
    minCodePoints: 1,
    maxCodePoints: 200,
    trim: true,
});
export const DictionaryCursorSchema = z
    .string()
    .min(1)
    .max(512)
    .regex(CURSOR_PATTERN);
export const DictionaryPageSizeSchema = z.coerce.number().int().min(1).max(100);
export const DictionaryPublicPageSizeSchema = z.coerce
    .number()
    .int()
    .min(1)
    .max(25);
export const DictionaryIdempotencyKeySchema = z
    .string()
    .min(16)
    .max(128)
    .regex(IDEMPOTENCY_KEY_PATTERN);
export const DictionaryShareIdSchema = z
    .string()
    .min(16)
    .max(128)
    .regex(CAPABILITY_KEY_PATTERN);
export const DictionaryShareKeySchema = z
    .string()
    .min(43)
    .max(128)
    .regex(CAPABILITY_KEY_PATTERN);

export const DictionaryIdParamsSchema = z
    .object({ dictionaryId: DictionaryIdSchema })
    .strict();
export const DictionaryCardIdParamsSchema = z
    .object({
        dictionaryId: DictionaryIdSchema,
        cardId: DictionaryIdSchema,
    })
    .strict();
export const DictionaryGenerationJobIdParamsSchema = z
    .object({ jobId: DictionaryIdSchema })
    .strict();
export const SharedDictionaryParamsSchema = z
    .object({ shareId: DictionaryShareIdSchema })
    .strict();
export const DictionaryIdempotencyHeadersSchema = z
    .object({ 'idempotency-key': DictionaryIdempotencyKeySchema })
    .passthrough();
export const DictionaryShareKeyHeadersSchema = z
    .object({ 'x-languon-share-key': DictionaryShareKeySchema })
    .passthrough();

export const EmptyDictionaryBodySchema = z.object({}).strict();

export type DictionaryId = z.infer<typeof DictionaryIdSchema>;
export type DictionaryTimestamp = z.infer<typeof DictionaryTimestampSchema>;
export type DictionaryVersion = z.infer<typeof DictionaryVersionSchema>;
export type DictionaryLanguageTag = z.infer<typeof DictionaryLanguageTagSchema>;
export type DictionaryLanguageRole = z.infer<
    typeof DictionaryLanguageRoleSchema
>;
export type DictionaryVisibility = z.infer<typeof DictionaryVisibilitySchema>;
export type DictionaryLifecycle = z.infer<typeof DictionaryLifecycleSchema>;
export type DictionaryAuthorship = z.infer<typeof DictionaryAuthorshipSchema>;
export type DictionaryNotation = z.infer<typeof DictionaryNotationSchema>;
export type DictionaryEnableOverride = z.infer<
    typeof DictionaryEnableOverrideSchema
>;
