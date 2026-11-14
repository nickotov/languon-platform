import { z } from 'zod';
import {
    ExerciseActivityFormatSchema,
    ExerciseActivityIdSchema,
} from './exercise-activity';
import { getExerciseActivity } from './exercise-activity-catalog';

const text = (max: number) =>
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
const unique = <T>(items: T[], identity: (item: T) => string) =>
    new Set(items.map(identity)).size === items.length;
const answers = z
    .array(text(500))
    .min(1)
    .max(20)
    .refine(
        (items) =>
            unique(items, (item) =>
                item.normalize('NFC').trim().replace(/\s+/gu, ' '),
            ),
        'Prepared answers must be distinct after NFC and whitespace normalization.',
    );

export const ExerciseActivityIdentitySchema = z
    .object({ id: ExerciseActivityIdSchema, version: z.literal(1) })
    .strict();

/** Semantic roles stay stable when the renderer translates their display labels. */
export const NamedExerciseClassificationSchema = z
    .object({
        roles: z
            .array(
                z
                    .object({
                        choiceId: z.uuid(),
                        role: z.enum(['true', 'false', 'not-stated']),
                    })
                    .strict(),
            )
            .length(3)
            .refine(
                (roles) =>
                    unique(roles, (item) => item.choiceId) &&
                    roles.every(
                        (item, index) =>
                            item.role ===
                            ['true', 'false', 'not-stated'][index],
                    ),
                'Classification needs distinct choices ordered True, False, Not stated.',
            ),
        absenceRationale: text(2_000).optional(),
    })
    .strict();

/** Learning-block validation binds these identities to the actual exercise interaction. */
export const NamedExerciseKeySchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('choice'),
            correctChoiceId: z.uuid(),
            classification: NamedExerciseClassificationSchema.optional(),
            explanations: z
                .array(
                    z
                        .object({
                            choiceId: z.uuid(),
                            explanation: text(2_000),
                        })
                        .strict(),
                )
                .min(2)
                .max(12),
        })
        .strict()
        .refine(
            (key) =>
                unique(key.explanations, (item) => item.choiceId) &&
                key.explanations.some(
                    (item) => item.choiceId === key.correctChoiceId,
                ) &&
                (!key.classification ||
                    (key.explanations.length === 3 &&
                        key.classification.roles.every((role) =>
                            key.explanations.some(
                                (item) => item.choiceId === role.choiceId,
                            ),
                        ))),
            'Choice explanations need unique identities and the correct choice.',
        ),
    z
        .object({
            kind: z.literal('gaps'),
            gaps: z
                .array(
                    z
                        .object({
                            gapId: z.uuid(),
                            acceptedAnswers: answers,
                            explanation: text(2_000),
                        })
                        .strict(),
                )
                .min(1)
                .max(20),
        })
        .strict()
        .refine(
            (key) => unique(key.gaps, (gap) => gap.gapId),
            'Prepared gap keys need unique gap identities.',
        ),
    z.object({ kind: z.literal('text'), acceptedAnswers: answers }).strict(),
]);

export const NamedExerciseRubricSchema = z
    .object({
        criteria: z
            .array(
                z
                    .object({
                        dimension: z.enum([
                            'task-completion',
                            'meaning',
                            'target-use',
                            'evidence',
                        ]),
                        requirement: text(2_000),
                    })
                    .strict(),
            )
            .min(2)
            .max(4),
    })
    .strict()
    .refine(
        (rubric) =>
            unique(rubric.criteria, (item) => item.dimension) &&
            ['task-completion', 'meaning'].every((dimension) =>
                rubric.criteria.some((item) => item.dimension === dimension),
            ),
        'A rubric needs distinct criteria covering task completion and meaning.',
    );

export const NamedExerciseCheckingSchema = z.discriminatedUnion('policy', [
    z
        .object({
            policy: z.literal('prepared-key'),
            key: NamedExerciseKeySchema,
        })
        .strict(),
    z
        .object({
            policy: z.literal('hybrid'),
            key: NamedExerciseKeySchema,
            rubric: NamedExerciseRubricSchema,
        })
        .strict(),
    z
        .object({
            policy: z.literal('ai-rubric'),
            rubric: NamedExerciseRubricSchema,
        })
        .strict(),
]);

// These are content origins, never authority. The server must resolve them within
// the authorized document/conversation and freeze the actual source before use.
const blockOrigin = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('block'), blockId: z.uuid() }).strict(),
    z
        .object({
            kind: z.literal('proposal'),
            proposalId: z.uuid(),
            blockId: z.uuid(),
        })
        .strict(),
]);

export const NamedExerciseSourceSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('vocabulary'),
            origin: blockOrigin,
            entries: z
                .array(
                    z
                        .object({
                            entryId: z.uuid(),
                            term: text(500),
                            sense: text(2_000),
                        })
                        .strict(),
                )
                .min(1)
                .max(50)
                .refine((items) => unique(items, (item) => item.entryId)),
        })
        .strict(),
    z
        .object({
            kind: z.literal('grammar'),
            origin: blockOrigin,
            rule: text(8_000),
        })
        .strict(),
    z
        .object({
            kind: z.literal('text'),
            origin: blockOrigin,
            passages: z
                .array(
                    z
                        .object({ segmentId: z.uuid(), text: text(8_000) })
                        .strict(),
                )
                .min(1)
                .max(20)
                .refine((items) => unique(items, (item) => item.segmentId)),
        })
        .strict(),
    z
        .object({
            kind: z.literal('text-selection'),
            origin: z
                .object({
                    noteId: z.uuid(),
                    noteVersion: z.number().int().nonnegative(),
                })
                .strict(),
            text: text(40_000),
        })
        .strict(),
]);

/** Versioned named-task semantics shared by authoring, publication and private practice. */
export const NamedExerciseSemanticsSchema = z
    .object({
        activity: ExerciseActivityIdentitySchema,
        objective: text(2_000),
        language,
        explanationLanguage: language,
        format: ExerciseActivityFormatSchema,
        checking: NamedExerciseCheckingSchema,
        sources: z.array(NamedExerciseSourceSchema).min(1).max(8),
    })
    .strict()
    .superRefine((value, ctx) => {
        const activity = getExerciseActivity(value.activity.id);
        const issue = (path: string[], message: string) =>
            ctx.addIssue({ code: 'custom', path, message });

        if (value.format !== activity.format) {
            issue(['format'], 'Format must match the selected activity.');
        }

        if (value.checking.policy !== activity.checkingPolicy) {
            issue(
                ['checking', 'policy'],
                'Checking policy is fixed by the activity.',
            );
        }

        if ('key' in value.checking) {
            const expectedKey = {
                'multiple-choice': 'choice',
                'fill-in-the-blank': 'gaps',
                'free-text': 'text',
            }[value.format];

            if (value.checking.key.kind !== expectedKey) {
                issue(
                    ['checking', 'key'],
                    'Prepared key must match the interaction.',
                );
            }

            const key = value.checking.key;
            if (value.activity.id === 'R03') {
                if (key.kind !== 'choice' || !key.classification) {
                    issue(
                        ['checking', 'key', 'classification'],
                        'True, false or not stated requires three ordered classification roles.',
                    );
                } else {
                    const notStated = key.classification.roles[2]!;
                    if (key.correctChoiceId === notStated.choiceId) {
                        const explanation = key.explanations.find(
                            (item) => item.choiceId === notStated.choiceId,
                        )?.explanation;
                        const rationale = key.classification.absenceRationale;
                        const normalized = (text: string) =>
                            text.normalize('NFC').trim().replace(/\s+/gu, ' ');

                        if (
                            !rationale ||
                            !explanation ||
                            normalized(rationale) !== normalized(explanation)
                        ) {
                            issue(
                                [
                                    'checking',
                                    'key',
                                    'classification',
                                    'absenceRationale',
                                ],
                                'A correct Not stated answer needs its specific absence rationale as the prepared choice explanation.',
                            );
                        }
                    }
                }
            } else if (key.kind === 'choice' && key.classification) {
                issue(
                    ['checking', 'key', 'classification'],
                    'Classification roles apply only to True, false or not stated.',
                );
            }
        }

        for (const [index, source] of value.sources.entries()) {
            const kind =
                source.kind === 'text-selection' ? 'text' : source.kind;

            if (!activity.supportedSourceKinds.includes(kind)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['sources', index, 'kind'],
                    message: 'Source does not meet this activity prerequisite.',
                });
            }
        }

        if ('rubric' in value.checking) {
            const dimension =
                activity.category === 'vocabulary' ||
                activity.category === 'grammar'
                    ? 'target-use'
                    : activity.category === 'reading'
                      ? 'evidence'
                      : undefined;

            if (
                dimension &&
                !value.checking.rubric.criteria.some(
                    (item) => item.dimension === dimension,
                )
            ) {
                issue(
                    ['checking', 'rubric'],
                    `Rubric must cover ${dimension}.`,
                );
            }
        }

        // Bound aggregate frozen material as well as individual fields. Schema
        // topology is finite and strict, so cyclic/foreign structures fail above.
        if (JSON.stringify(value).length > 80_000) {
            issue(
                [],
                'Named exercise semantics exceed their total payload limit.',
            );
        }
    });

export type NamedExerciseKey = z.infer<typeof NamedExerciseKeySchema>;
export type NamedExerciseClassification = z.infer<
    typeof NamedExerciseClassificationSchema
>;
export type NamedExerciseRubric = z.infer<typeof NamedExerciseRubricSchema>;
export type NamedExerciseChecking = z.infer<typeof NamedExerciseCheckingSchema>;
export type NamedExerciseSource = z.infer<typeof NamedExerciseSourceSchema>;
export type NamedExerciseSemantics = z.infer<
    typeof NamedExerciseSemanticsSchema
>;
