import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
    ExerciseActivityIdSchema,
    ExerciseLearningBlockSchema,
    getExerciseActivity,
    NamedExerciseKeySchema,
    NamedExerciseRubricSchema,
    NamedExerciseSemanticsSchema,
    type ExerciseActivityId,
    type ExerciseLearningBlock,
    type NamedExerciseSource,
    type LearningBlock,
    LearningBlockSchema,
} from '@languon/contracts';
import type { LearningContentBrief } from '../../application/learning-content-contract';

const uniqueIds = z
    .array(z.uuid())
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length);
const sourceBinding = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('vocabulary'),
            blockId: z.uuid(),
            entryIds: uniqueIds,
        })
        .strict(),
    z.strictObject({
        kind: z.literal('audio'),
        blockId: z.uuid(),
        segmentIds: uniqueIds.max(20),
    }),
    z.object({ kind: z.literal('grammar'), blockId: z.uuid() }).strict(),
    z
        .object({
            kind: z.literal('text'),
            blockId: z.uuid(),
            segmentIds: uniqueIds.max(20),
        })
        .strict(),
    z
        .object({
            kind: z.literal('text-selection'),
            sourceId: z.string().min(1).max(100).optional(),
            from: z.number().int().min(0).max(40_000).optional(),
            to: z.number().int().min(1).max(40_000).optional(),
        })
        .strict()
        .refine(
            (value) =>
                (value.from === undefined && value.to === undefined) ||
                (value.from !== undefined &&
                    value.to !== undefined &&
                    value.to > value.from),
        ),
]);

const [choice, gap, freeText] = ExerciseLearningBlockSchema.options;
const base = {
    title: freeText.shape.title,
    question: freeText.shape.question,
    objective: NamedExerciseSemanticsSchema.shape.objective,
    hint: freeText.shape.hint,
    explanation: freeText.shape.explanation,
};
const requirement =
    NamedExerciseRubricSchema.shape.criteria.element.shape.requirement;
const baseRubric = z.strictObject({
    'task-completion': requirement,
    meaning: requirement,
});
const readingRubric = baseRubric.extend({ evidence: requirement });
const targetRubric = baseRubric.extend({ 'target-use': requirement });
const acceptedAnswers = NamedExerciseKeySchema.options[2].shape.acceptedAnswers;
const keyedGap = NamedExerciseKeySchema.options[1].shape.gaps.element;
const gapPart = z.discriminatedUnion('kind', [
    gap.shape.parts.element.options[0],
    keyedGap.omit({ gapId: true }).extend({ kind: z.literal('gap') }),
]);
const choiceContent = z.strictObject({
    text: choice.shape.choices.element.shape.text,
    explanation:
        NamedExerciseKeySchema.options[0].shape.explanations.element.shape
            .explanation,
});
const classificationRoles = ['true', 'false', 'not-stated'] as const;
const roleLabels = { true: 'True', false: 'False', 'not-stated': 'Not stated' };

type BindingKind = z.infer<typeof sourceBinding>['kind'];
function authoringSchema(
    activityId: ExerciseActivityId,
    available?: ReadonlySet<BindingKind>,
) {
    const activity = getExerciseActivity(activityId);
    const bindings = sourceBinding.options.filter((option) => {
        const kind = option.shape.kind.value;

        return (
            (!available || available.has(kind)) &&
            activity.supportedSourceKinds.includes(
                kind === 'text-selection' ? 'text' : kind,
            )
        );
    });
    const [first, second, ...rest] = bindings;
    if (!first) {
        throw new Error(
            'The selected activity has no eligible exercise source.',
        );
    }

    const common = z.strictObject({
        activityId: z.literal(activityId),
        ...base,
        sourceBindings: z
            .array(second ? z.union([first!, second, ...rest]) : first!)
            .min(1)
            .max(activity.category === 'listening' ? 1 : 8),
    });

    if (activityId === 'R03') {
        return common.extend({
            correctRole: z.enum(classificationRoles),
            reasons: z.strictObject({
                true: requirement,
                false: requirement,
                'not-stated': requirement,
            }),
        });
    }

    if (activity.format === 'multiple-choice') {
        return common.extend({
            correct: choiceContent,
            distractors:
                activityId === 'L01'
                    ? z.array(choiceContent).length(2)
                    : z.array(choiceContent).min(1).max(11),
        });
    }

    const rubric =
        activity.category === 'reading'
            ? readingRubric
            : activity.category === 'writing'
              ? baseRubric
              : targetRubric;

    if (activity.format === 'fill-in-the-blank') {
        const gaps = common.extend({
            referenceAnswer: freeText.shape.referenceAnswer,
            parts: z.array(gapPart).min(2).max(100),
        });

        return activity.checkingPolicy === 'prepared-key'
            ? gaps
            : gaps.extend({ rubric });
    }

    if (activityId === 'L02') {
        return common.extend({ activityId: z.literal('L02') });
    }

    if (activity.checkingPolicy === 'hybrid') {
        return common.extend({ acceptedAnswers, rubric });
    }

    return common.extend({
        referenceAnswer: freeText.shape.referenceAnswer,
        rubric,
    });
}

export function namedExerciseAuthoringSchemaForBrief(
    brief: LearningContentBrief,
    taskBindings?: ReadonlyMap<string, ReadonlySet<BindingKind>>,
): z.ZodType {
    const activities = new Map<ExerciseActivityId, Set<BindingKind>>();
    for (const task of brief.tasks) {
        for (const { activityId } of task.activities ?? []) {
            const kinds = activities.get(activityId) ?? new Set<BindingKind>();
            for (const kind of taskBindings?.get(task.id) ?? []) {
                kinds.add(kind);
            }

            activities.set(activityId, kinds);
        }
    }

    const [first, second, ...rest] = [...activities].map(
        ([activityId, kinds]) =>
            authoringSchema(activityId, taskBindings ? kinds : undefined),
    );

    return second ? z.union([first!, second, ...rest]) : (first ?? z.never());
}

export function parseExercisePayload(value: unknown) {
    const { activityId } = z
        .object({ activityId: ExerciseActivityIdSchema })
        .parse(value);

    return authoringSchema(activityId).parse(value);
}

type Payload = ReturnType<typeof parseExercisePayload>;
function compileInteraction(payload: Payload, sources: NamedExerciseSource[]) {
    if (payload.activityId === 'L02') {
        const [audio] = sources;
        if (audio?.kind !== 'audio' || audio.passages.length !== 1) {
            throw new Error('Dictation needs one transcript segment.');
        }

        const referenceAnswer = audio.passages[0]!.text;

        return {
            fields: { referenceAnswer, acceptedAnswers: [referenceAnswer] },
            checking: {
                policy: 'prepared-key',
                key: { kind: 'text', acceptedAnswers: [referenceAnswer] },
            },
        };
    }

    if ('correctRole' in payload || 'correct' in payload) {
        const classification = 'correctRole' in payload;
        const candidates = classification
            ? classificationRoles.map((role) => ({
                  text: roleLabels[role],
                  explanation: payload.reasons[role],
              }))
            : [...payload.distractors];
        // Keep the keyed choice out of a predictable position.
        const correctIndex = classification
            ? classificationRoles.indexOf(payload.correctRole)
            : randomInt(candidates.length + 1);

        if (!classification) {
            candidates.splice(correctIndex, 0, payload.correct);
        }

        const choices = candidates.map(({ text }) => ({
            id: randomUUID(),
            text,
        }));
        const correct = choices[correctIndex]!;
        const explanations = choices.map(({ id }, index) => ({
            choiceId: id,
            explanation: candidates[index]!.explanation,
        }));
        const key = {
            kind: 'choice',
            correctChoiceId: correct.id,
            explanations,
            ...(classification
                ? {
                      classification: {
                          roles: classificationRoles.map((role, index) => ({
                              role,
                              choiceId: choices[index]!.id,
                          })),
                          ...(payload.correctRole === 'not-stated'
                              ? {
                                    absenceRationale:
                                        payload.reasons['not-stated'],
                                }
                              : {}),
                      },
                  }
                : {}),
        };

        return {
            fields: {
                choices,
                correctChoiceId: correct.id,
                referenceAnswer: correct.text,
                ...(classification && payload.correctRole === 'not-stated'
                    ? { explanation: payload.reasons['not-stated'] }
                    : {}),
            },
            checking: { policy: 'prepared-key', key },
        };
    }

    const rubricFields =
        'rubric' in payload
            ? {
                  rubric: {
                      criteria: Object.entries(payload.rubric).map(
                          ([dimension, requirement]) => ({
                              dimension,
                              requirement,
                          }),
                      ),
                  },
              }
            : {};

    if ('parts' in payload) {
        const gaps: z.infer<typeof keyedGap>[] = [];
        const parts = payload.parts.map((part) => {
            if (part.kind === 'text') {
                return part;
            }

            const id = randomUUID();
            gaps.push({
                gapId: id,
                acceptedAnswers: part.acceptedAnswers,
                explanation: part.explanation,
            });

            return { kind: 'gap', id, acceptedAnswers: part.acceptedAnswers };
        });

        return {
            fields: { parts, referenceAnswer: payload.referenceAnswer },
            checking: {
                policy: getExerciseActivity(payload.activityId).checkingPolicy,
                ...rubricFields,
                key: { kind: 'gaps', gaps },
            },
        };
    }

    if ('acceptedAnswers' in payload) {
        return {
            fields: {
                acceptedAnswers: payload.acceptedAnswers,
                referenceAnswer: payload.acceptedAnswers[0],
            },
            checking: {
                policy: getExerciseActivity(payload.activityId).checkingPolicy,
                ...rubricFields,
                key: { kind: 'text', acceptedAnswers: payload.acceptedAnswers },
            },
        };
    }

    return {
        fields: { referenceAnswer: payload.referenceAnswer },
        checking: { policy: 'ai-rubric', ...rubricFields },
    };
}

export interface ExercisePublicationContext {
    language: string;
    explanationLanguage: string;
    group?: ExerciseLearningBlock['group'];
    linkableBlocks?: readonly LearningBlock[];
}

/** A saved source snapshot may refer to a different version of the same block.
 * Add a document navigation link only while its exact segments are available. */
function passageLink(
    sources: NamedExerciseSource[],
    blocks: readonly LearningBlock[],
) {
    const [passage, ...others] = sources;
    if (passage?.kind === 'audio' && !others.length) {
        return {
            blockId: passage.origin.blockId,
            segmentIds: passage.passages.map((item) => item.segmentId),
        };
    }

    if (passage?.kind !== 'text' || others.length) {
        return undefined;
    }

    const target = blocks.find((block) => block.id === passage.origin.blockId);
    if (
        target?.type !== 'bilingual-text' ||
        !passage.passages.every((item) =>
            target.segments.some(
                (segment) =>
                    segment.id === item.segmentId && segment.text === item.text,
            ),
        )
    ) {
        return undefined;
    }

    return {
        blockId: target.id,
        segmentIds: passage.passages.map((item) => item.segmentId),
    };
}

export function compileExercisePayload(
    payload: Payload,
    sources: NamedExerciseSource[],
    publication: ExercisePublicationContext,
) {
    const activity = getExerciseActivity(payload.activityId);
    const { fields, checking } = compileInteraction(payload, sources);
    const source = passageLink(sources, publication.linkableBlocks ?? []);

    const group =
        source && sources[0]?.kind === 'audio'
            ? {
                  ...publication.group,
                  id: publication.group?.id ?? source.blockId,
                  parentBlockId: source.blockId,
              }
            : publication.group;

    return LearningBlockSchema.parse({
        id: randomUUID(),
        type: 'exercise',
        format: activity.format,
        question: payload.question,
        explanation: payload.explanation,
        hint: payload.hint,
        title: payload.title,
        ...fields,
        ...(group ? { group } : {}),
        ...(source ? { source } : {}),
        semantics: {
            activity: { id: activity.id, version: activity.version },
            objective: payload.objective,
            language: publication.language,
            explanationLanguage: publication.explanationLanguage,
            format: activity.format,
            checking,
            sources,
        },
    });
}
