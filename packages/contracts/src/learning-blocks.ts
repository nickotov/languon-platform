import { z } from 'zod';

/** Content only: identities are not authorization grants and text is never HTML. */
export const LearningBlockIdSchema = z.string().uuid();
const text = (max = 8_000) =>
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
const language = z
    .string()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u);
const base = { id: LearningBlockIdSchema, title: text(200).optional() };
const uniqueIds = (items: { id: string }[]) =>
    new Set(items.map((item) => item.id)).size === items.length;
const seconds = z.number().finite().min(0).max(86_400);
const range = z
    .object({ startSeconds: seconds, endSeconds: seconds })
    .strict()
    .refine(
        (value) => value.endSeconds > value.startSeconds,
        'End must follow start.',
    );

/** Only for browser playback; this is not an SSRF-safe server-fetch authorization. */
export const LearningMediaUrlSchema = z
    .string()
    .max(2_048)
    .refine((value) => {
        try {
            const url = new URL(value);
            return (
                /^https:\/\//iu.test(value) &&
                !/[\s\\]/u.test(value) &&
                !Array.from(value).some(
                    (character) =>
                        character.charCodeAt(0) < 32 ||
                        character.charCodeAt(0) === 127,
                ) &&
                !url.username &&
                !url.password &&
                Boolean(url.hostname)
            );
        } catch {
            return false;
        }
    }, 'Media URLs require absolute HTTPS without credentials or control characters.');

export const LearningTranscriptSchema = z
    .object({
        language,
        segments: z
            .array(
                z
                    .object({
                        id: LearningBlockIdSchema,
                        text: text(),
                        timing: range.optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(500)
            .refine(uniqueIds, 'Segment IDs must be unique.'),
    })
    .strict()
    .superRefine((value, ctx) => {
        let end = 0;
        for (const segment of value.segments) {
            if (!segment.timing) continue;
            if (segment.timing.startSeconds < end)
                ctx.addIssue({
                    code: 'custom',
                    message:
                        'Timed transcript segments must be ordered and nonoverlapping.',
                });
            end = segment.timing.endSeconds;
        }
    });

export const VideoLearningBlockSchema = z
    .object({
        ...base,
        type: z.literal('video'),
        description: text().optional(),
        source: z.discriminatedUnion('kind', [
            z
                .object({
                    kind: z.literal('youtube'),
                    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/u),
                })
                .strict(),
            z
                .object({ kind: z.literal('url'), url: LearningMediaUrlSchema })
                .strict(),
        ]),
        transcript: LearningTranscriptSchema.optional(),
    })
    .strict();

export const VocabularyLearningBlockSchema = z
    .object({
        ...base,
        type: z.literal('vocabulary'),
        language,
        translationLanguage: language,
        entries: z
            .array(
                z
                    .object({
                        id: LearningBlockIdSchema,
                        term: text(500),
                        translation: text(2_000),
                        pronunciation: text(500).optional(),
                        definition: text(2_000).optional(),
                        example: text(2_000).optional(),
                        exampleTranslation: text(2_000).optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(200)
            .refine(uniqueIds, 'Entry IDs must be unique.'),
    })
    .strict();

export const BilingualTextLearningBlockSchema = z
    .object({
        ...base,
        type: z.literal('bilingual-text'),
        language,
        segments: z
            .array(
                z.object({ id: LearningBlockIdSchema, text: text() }).strict(),
            )
            .min(1)
            .max(500)
            .refine(uniqueIds, 'Source segment IDs must be unique.'),
        translations: z
            .array(
                z
                    .object({
                        language,
                        segments: z
                            .array(
                                z
                                    .object({
                                        sourceSegmentId: LearningBlockIdSchema,
                                        text: text(),
                                    })
                                    .strict(),
                            )
                            .min(1)
                            .max(500),
                    })
                    .strict(),
            )
            .max(20),
    })
    .strict()
    .superRefine((value, ctx) => {
        const ids = new Set(value.segments.map((segment) => segment.id));
        if (
            new Set(
                value.translations.map((translation) =>
                    translation.language.toLowerCase(),
                ),
            ).size !== value.translations.length
        )
            ctx.addIssue({
                code: 'custom',
                message: 'Translation languages must be unique.',
            });
        for (const translation of value.translations) {
            const translated = translation.segments.map(
                (segment) => segment.sourceSegmentId,
            );
            if (
                translated.length !== ids.size ||
                new Set(translated).size !== ids.size ||
                translated.some((id) => !ids.has(id))
            )
                ctx.addIssue({
                    code: 'custom',
                    message:
                        'Translations must align exactly once to every source segment.',
                });
        }
    });

export const AudioLearningBlockSchema = z
    .object({
        ...base,
        type: z.literal('audio'),
        /** Omitted until an author uploads or generates a recording. */
        assetId: z.string().uuid().optional(),
        /** Explicit source/speech language, including before a transcript exists. */
        language: language.optional(),
        transcript: LearningTranscriptSchema.optional(),
        sourceText: text(40_000).optional(),
    })
    .strict();

export const GrammarLearningBlockSchema = z
    .object({
        ...base,
        type: z.literal('grammar'),
        language,
        rule: text().optional(),
        pattern: text().optional(),
        examples: z
            .array(
                z
                    .object({
                        text: text(2_000),
                        translation: text(2_000).optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(50)
            .optional(),
        commonMistakes: z
            .array(
                z
                    .object({
                        incorrect: text(2_000),
                        correct: text(2_000),
                        explanation: text(2_000).optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(50)
            .optional(),
    })
    .strict()
    .refine(
        (value) =>
            Boolean(
                value.rule ||
                value.pattern ||
                value.examples?.length ||
                value.commonMistakes?.length,
            ),
        'A grammar block needs at least one section.',
    );

const exerciseBase = {
    ...base,
    type: z.literal('exercise'),
    question: text(),
    referenceAnswer: text(),
    explanation: text(),
    hint: text().optional(),
    /** Presentation grouping never replaces an individual exercise identity. */
    group: z
        .object({
            id: LearningBlockIdSchema,
            title: text(200).optional(),
            parentBlockId: LearningBlockIdSchema.optional(),
        })
        .strict()
        .optional(),
    evaluationCriteria: text().optional(),
    source: z
        .object({
            blockId: LearningBlockIdSchema,
            segmentIds: z
                .array(LearningBlockIdSchema)
                .min(1)
                .max(500)
                .refine((ids) => new Set(ids).size === ids.length),
        })
        .strict()
        .optional(),
};
export const ExerciseLearningBlockSchema = z.discriminatedUnion('format', [
    z
        .object({
            ...exerciseBase,
            format: z.literal('multiple-choice'),
            choices: z
                .array(
                    z
                        .object({
                            id: LearningBlockIdSchema,
                            text: text(2_000),
                        })
                        .strict(),
                )
                .min(2)
                .max(12)
                .refine(uniqueIds),
            correctChoiceId: LearningBlockIdSchema,
        })
        .strict()
        .refine(
            (value) =>
                value.choices.some(
                    (choice) => choice.id === value.correctChoiceId,
                ),
            'Correct choice must exist.',
        ),
    z
        .object({
            ...exerciseBase,
            format: z.literal('fill-in-the-blank'),
            parts: z
                .array(
                    z.discriminatedUnion('kind', [
                        z
                            .object({ kind: z.literal('text'), text: text() })
                            .strict(),
                        z
                            .object({
                                kind: z.literal('gap'),
                                id: LearningBlockIdSchema,
                                acceptedAnswers: z
                                    .array(text(500))
                                    .min(1)
                                    .max(20),
                            })
                            .strict(),
                    ]),
                )
                .min(1)
                .max(100),
        })
        .strict()
        .refine((value) => {
            const gaps = value.parts.filter((part) => part.kind === 'gap');
            return gaps.length > 0 && uniqueIds(gaps);
        }, 'A gap exercise needs unique gaps.'),
    z
        .object({
            ...exerciseBase,
            format: z.literal('free-text'),
            acceptedAnswers: z.array(text()).max(20).optional(),
        })
        .strict(),
]);

const StructuredLearningBlockSchema = z.discriminatedUnion('type', [
    VideoLearningBlockSchema,
    VocabularyLearningBlockSchema,
    BilingualTextLearningBlockSchema,
    AudioLearningBlockSchema,
    GrammarLearningBlockSchema,
    ExerciseLearningBlockSchema,
]);
/** Bound the entire payload before walking typed arrays, including translations. */
export const LearningBlockSchema = z
    .unknown()
    .superRefine((value, ctx) => {
        const pending = [{ value, depth: 0 }];
        let count = 0;
        let characters = 0;
        while (pending.length) {
            const current = pending.pop()!;
            count += 1;
            if (typeof current.value === 'string')
                characters += current.value.length;
            if (count > 10_000 || characters > 80_000 || current.depth > 12) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Learning block exceeds its total payload limit.',
                });
                return;
            }
            if (current.value && typeof current.value === 'object') {
                const entries = Object.entries(current.value);
                if (entries.length + pending.length > 10_000) {
                    ctx.addIssue({
                        code: 'custom',
                        message:
                            'Learning block exceeds its total structure limit.',
                    });
                    return;
                }
                for (const [key, child] of entries) {
                    characters += key.length;
                    pending.push({ value: child, depth: current.depth + 1 });
                }
            }
        }
    })
    .pipe(StructuredLearningBlockSchema);
export type LearningBlock = z.infer<typeof LearningBlockSchema>;
export type LearningTranscript = z.infer<typeof LearningTranscriptSchema>;
export type ExerciseLearningBlock = z.infer<typeof ExerciseLearningBlockSchema>;
