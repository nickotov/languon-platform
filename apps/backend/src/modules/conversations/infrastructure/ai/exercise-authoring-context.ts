import { learningContentProseText } from '../../application/learning-content-prose';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
    ExerciseActivityIdentitySchema,
    getExerciseActivity,
    NamedExerciseCheckingSchema,
    NamedExerciseKeySchema,
    NamedExerciseClassificationSchema,
    ExerciseLearningBlockSchema,
    LearningBlockSchema,
    type LearningBlock,
    type GeneratedArtifactOrigin,
    type CapturedBlockOrigin,
    type KnowledgeBody,
    type NamedExerciseSource,
    type ExerciseActivitySourceKind,
} from '@languon/contracts';
import type { LearningContentTask } from '../../application/learning-content-contract';
import type {
    LearningContentBrief,
    LearningContentResult,
} from '../../application/learning-content-contract';
import { resolveExerciseActivityAllocations } from '../../application/exercise-activity-allocation';
import {
    grammarExerciseSourceRule,
    vocabularyExerciseSourceSense,
} from './exercise-activities';

export interface ExerciseAuthoringSource {
    blocks: readonly LearningBlock[];
    proposalId?: string;
    proposalIds?: ReadonlyMap<string, string>;
    capturedOrigins?: ReadonlyMap<string, CapturedBlockOrigin>;
    selection?: { noteId: string; noteVersion: number; text: string };
    generatedText?: { origin: GeneratedArtifactOrigin; text: string };
    providedText?: { materialId: string; text: string };
    passages?: readonly {
        id: string;
        source: Extract<
            NamedExerciseSource,
            { kind: 'text-selection' | 'generated-text' | 'provided-text' }
        >;
    }[];
}

function sourcePassages(context: ExerciseAuthoringSource) {
    return [
        ...(context.passages ?? []),
        ...(context.selection
            ? [
                  {
                      id: 'selection',
                      source: {
                          kind: 'text-selection' as const,
                          origin: {
                              noteId: context.selection.noteId,
                              noteVersion: context.selection.noteVersion,
                          },
                          text: context.selection.text,
                      },
                  },
              ]
            : []),
        ...(context.generatedText
            ? [
                  {
                      id: context.generatedText.origin.artifactId,
                      source: {
                          kind: 'generated-text' as const,
                          ...context.generatedText,
                      },
                  },
              ]
            : []),
        ...(context.providedText
            ? [
                  {
                      id: context.providedText.materialId,
                      source: {
                          kind: 'provided-text' as const,
                          origin: {
                              kind: 'provided-material' as const,
                              materialId: context.providedText.materialId,
                              contentHash: createHash('sha256')
                                  .update(context.providedText.text)
                                  .digest('hex'),
                          },
                          text: context.providedText.text,
                      },
                  },
              ]
            : []),
    ];
}

function mergeSourceContexts(
    contexts: ExerciseAuthoringSource[],
): ExerciseAuthoringSource {
    return {
        blocks: contexts.flatMap((context) => context.blocks),
        capturedOrigins: new Map(
            contexts.flatMap((context) => [...(context.capturedOrigins ?? [])]),
        ),
        passages: contexts.flatMap(sourcePassages),
        proposalIds: new Map(
            contexts.flatMap((context) => [
                ...(context.proposalIds ??
                    new Map(
                        context.proposalId
                            ? context.blocks.map((block) => [
                                  block.id,
                                  context.proposalId!,
                              ])
                            : [],
                    )),
            ]),
        ),
    };
}

export function prepareNamedExerciseBrief(
    brief: LearningContentBrief,
    contexts: ReadonlyMap<string, ExerciseAuthoringSource>,
    fallback: readonly LearningBlock[],
):
    | { status: 'ready'; brief: LearningContentBrief }
    | Exclude<LearningContentResult, { status: 'ready' }> {
    const tasks: LearningContentTask[] = [];
    for (const task of brief.tasks) {
        if (task.kind !== 'exercises') {
            tasks.push(task);
            continue;
        }

        let kinds: ExerciseActivitySourceKind[];
        if (task.source?.kind === 'task' || task.dependencies?.length) {
            const ids = [
                ...new Set([
                    ...(task.source?.kind === 'task'
                        ? [task.source.taskId]
                        : []),
                    ...(task.dependencies ?? []),
                ]),
            ];
            const dependencies = ids.map((id) =>
                brief.tasks.find((candidate) => candidate.id === id),
            );

            if (
                dependencies.some(
                    (dependency) =>
                        !dependency ||
                        dependency.id === task.id ||
                        dependency.kind === 'exercises',
                )
            ) {
                return {
                    status: 'needs-clarification',
                    missing: [{ taskId: task.id, fields: ['source'] }],
                };
            }

            kinds = [
                ...new Set([
                    ...dependencies.map(
                        (dependency): ExerciseActivitySourceKind =>
                            dependency!.kind === 'bilingual-text' ||
                            dependency!.kind === 'prose'
                                ? 'text'
                                : (dependency!.kind as
                                      'grammar' | 'vocabulary'),
                    ),
                    ...exerciseSourceKinds(
                        contexts.get(task.id) ?? { blocks: [] },
                    ),
                ]),
            ];
        } else {
            let context;
            try {
                context = exerciseTaskSource(task, [], contexts, fallback);
            } catch {
                return {
                    status: 'needs-clarification',
                    missing: [{ taskId: task.id, fields: ['source'] }],
                };
            }

            if (context.selection && context.selection.text.length > 40_000) {
                return {
                    status: 'needs-clarification',
                    missing: [{ taskId: task.id, fields: ['shorter-source'] }],
                };
            }

            kinds = exerciseSourceKinds(context);
        }

        const allocation = resolveExerciseActivityAllocations(task, kinds);
        if (allocation.status !== 'ready') {
            return {
                status: 'needs-clarification',
                missing: [{ taskId: task.id, fields: allocation.fields }],
            };
        }

        const { sourceText: _repeatedSourceText, ...requirements } = task;
        tasks.push({
            ...requirements,
            source: task.source ?? { kind: 'editor' },
            activities: allocation.allocations,
            count: allocation.allocations.reduce(
                (sum, item) => sum + item.count,
                0,
            ),
            explanationLanguage:
                task.explanationLanguage ??
                task.translationLanguage ??
                task.language,
        });
    }

    return { status: 'ready', brief: { ...brief, tasks } };
}

/** Deduplicate exact material across tasks; task bindings carry only references. */
export function projectExerciseAuthoringSources(
    contexts: ReadonlyMap<string, ExerciseAuthoringSource>,
    knownSourceTexts: ReadonlyMap<string, string> = new Map(),
) {
    const blocks = new Map<string, LearningBlock>();
    const excerpts = new Map<
        string,
        { id: string; text?: string; sourceTextRef?: string }
    >();
    const tasks = [...contexts].map(([taskId, context]) => {
        context.blocks.forEach((block) => {
            const existing = blocks.get(block.id);
            if (
                existing &&
                JSON.stringify(existing) !== JSON.stringify(block)
            ) {
                throw new Error(
                    'Choose one exact version of each source block.',
                );
            }

            blocks.set(block.id, block);
        });

        const selections = sourcePassages(context).map((passage) => {
            const text = passage.source.text;
            const id = `${taskId}-${passage.id}`;
            excerpts.set(id, {
                id,
                ...(knownSourceTexts.has(text)
                    ? { sourceTextRef: knownSourceTexts.get(text)! }
                    : { text }),
            });

            return { sourceId: passage.id, excerptId: id };
        });

        return {
            taskId,
            blockIds: context.blocks.map((block) => block.id),
            ...(selections.length ? { selections } : {}),
        };
    });

    return {
        blocks: [...blocks.values()],
        excerpts: [...excerpts.values()],
        tasks,
    };
}

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
    z.object({ kind: z.literal('grammar'), blockId: z.uuid() }).strict(),
    z
        .object({
            kind: z.literal('text'),
            blockId: z.uuid(),
            segmentIds: uniqueIds,
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

// The model selects identities, never authenticates origins or supplies frozen
// content. Keep full content snapshots out of repeated provider output.
const wireSemantics = z
    .object({
        activity: ExerciseActivityIdentitySchema,
        objective: z.string().min(1).max(2_000),
        language: z.string().min(2).max(35),
        explanationLanguage: z.string().min(2).max(35),
        format: z.enum(['multiple-choice', 'fill-in-the-blank', 'free-text']),
        checking: NamedExerciseCheckingSchema,
    })
    .strict();
const [choice, gaps, text] = ExerciseLearningBlockSchema.options;
const wireShape = {
    semantics: wireSemantics,
    sourceBindings: z.array(sourceBinding).min(1).max(8),
};

const namedExerciseAuthoringSchema = z.discriminatedUnion('format', [
    z.object({ ...choice.shape, ...wireShape }).strict(),
    z.object({ ...gaps.shape, ...wireShape }).strict(),
    z.object({ ...text.shape, ...wireShape }).strict(),
]);

/** Restrict the actual provider schema as well as instructions to this call's activities. */
export function namedExerciseAuthoringSchemaForBrief(
    brief: LearningContentBrief,
): z.ZodType {
    const ids = [
        ...new Set(
            brief.tasks.flatMap((task) =>
                (task.activities ?? []).map((item) => item.activityId),
            ),
        ),
    ];
    const formats = [
        ...new Set(ids.map((id) => getExerciseActivity(id).format)),
    ];
    const options = formats.map((format) => {
        const base = namedExerciseAuthoringSchema.options.find(
            (option) => option.shape.format.value === format,
        )!;
        const selected = ids.filter(
            (id) => getExerciseActivity(id).format === format,
        );
        const policies = new Set(
            selected.map((id) => getExerciseActivity(id).checkingPolicy),
        );
        const keyKind = {
            'multiple-choice': 'choice',
            'fill-in-the-blank': 'gaps',
            'free-text': 'text',
        }[format];
        let key: z.ZodType = NamedExerciseKeySchema.options.find(
            (option) => option.shape.kind.value === keyKind,
        )!;

        if (format === 'multiple-choice') {
            const choiceKey = z
                .object({ ...NamedExerciseKeySchema.options[0].shape })
                .strict();

            key = selected.includes('R03')
                ? choiceKey.extend({
                      classification:
                          selected.length === 1
                              ? NamedExerciseClassificationSchema
                              : NamedExerciseClassificationSchema.optional(),
                  })
                : choiceKey.omit({ classification: true });
        }

        const checkOptions = NamedExerciseCheckingSchema.options
            .filter((option) => policies.has(option.shape.policy.value))
            .map((option) =>
                z
                    .object({
                        ...option.shape,
                        ...('key' in option.shape ? { key } : {}),
                    })
                    .strict(),
            );
        const [firstCheck, secondCheck, ...otherChecks] = checkOptions;
        const checking = secondCheck
            ? z.union([firstCheck!, secondCheck, ...otherChecks])
            : firstCheck!;
        const sourceKinds = new Set(
            selected.flatMap(
                (id) => getExerciseActivity(id).supportedSourceKinds,
            ),
        );
        const bindings = sourceBinding.options.filter((option) => {
            const kind = option.shape.kind.value;

            return sourceKinds.has(kind === 'text-selection' ? 'text' : kind);
        });
        const [firstBinding, secondBinding, ...otherBindings] = bindings;
        const binding = secondBinding
            ? z.union([firstBinding!, secondBinding, ...otherBindings])
            : firstBinding!;
        const semantics = z
            .object({
                ...wireSemantics.shape,
                activity: z
                    .object({ id: z.enum(selected), version: z.literal(1) })
                    .strict(),
                format: z.literal(format),
                checking,
            })
            .strict();

        return z
            .object({
                ...base.shape,
                semantics,
                sourceBindings: z.array(binding).min(1).max(8),
            })
            .strict();
    });
    const [first, second, ...remaining] = options;

    return second
        ? z.union([first!, second, ...remaining])
        : (first ?? z.never());
}

export function exerciseSourceKinds(
    context: ExerciseAuthoringSource,
): ExerciseActivitySourceKind[] {
    const kinds = context.blocks.flatMap(
        (block): ExerciseActivitySourceKind[] => {
            if (block.type === 'vocabulary') {
                return [block.type];
            }

            if (block.type === 'grammar') {
                return block.rule || block.pattern ? ['grammar'] : [];
            }

            return block.type === 'bilingual-text' ? ['text' as const] : [];
        },
    );

    return [
        ...new Set([
            ...kinds,
            ...(sourcePassages(context).length ? ['text' as const] : []),
        ]),
    ];
}

/** Resolve only a fully validated predecessor; model task IDs never create a block identity. */
export function exerciseTaskSource(
    task: LearningContentTask,
    completed: readonly {
        taskId: string;
        blocks: LearningBlock[];
        prose?: KnowledgeBody | undefined;
        generatedOrigin?: GeneratedArtifactOrigin;
    }[],
    contexts: ReadonlyMap<string, ExerciseAuthoringSource>,
    fallback: readonly LearningBlock[],
): ExerciseAuthoringSource {
    if (task.source?.kind === 'task' || task.dependencies?.length) {
        const ids = [
            ...new Set([
                ...(task.source?.kind === 'task' ? [task.source.taskId] : []),
                ...(task.dependencies ?? []),
            ]),
        ];
        const dependencies = ids.map((id): ExerciseAuthoringSource => {
            const dependency = completed.find((item) => item.taskId === id);
            if (dependency?.prose && dependency.generatedOrigin) {
                return {
                    blocks: [],
                    generatedText: {
                        origin: dependency.generatedOrigin,
                        text: learningContentProseText(dependency.prose),
                    },
                };
            }

            if (!dependency?.blocks.length) {
                throw new Error(
                    'The completed exercise prerequisite is unavailable.',
                );
            }

            return { blocks: dependency.blocks };
        });

        return mergeSourceContexts([
            ...dependencies,
            ...(contexts.has(task.id) ? [contexts.get(task.id)!] : []),
        ]);
    }

    const context = contexts.get(task.id);
    if (context) {
        return context;
    }

    if (task.source?.kind === 'proposal' || task.source?.kind === 'selection') {
        throw new Error('The exact selected exercise source is unavailable.');
    }

    const blockId =
        task.source?.kind === 'editor' ? task.source.blockId : undefined;

    return {
        blocks: blockId
            ? fallback.filter((block) => block.id === blockId)
            : fallback,
    };
}

/** Freeze source values from host-owned context, then validate the complete current contract. */
export function completeNamedExerciseSources(
    value: unknown,
    context: ExerciseAuthoringSource,
): LearningBlock {
    const wire = namedExerciseAuthoringSchema.parse(value);
    const sources: NamedExerciseSource[] = wire.sourceBindings.map(
        (binding) => {
            if (binding.kind === 'text-selection') {
                const passages = sourcePassages(context);
                const passage = binding.sourceId
                    ? passages.find((item) => item.id === binding.sourceId)
                    : passages.length === 1
                      ? passages[0]
                      : undefined;

                if (!passage) {
                    throw new Error(
                        'The exact selected passage is unavailable or ambiguous.',
                    );
                }

                const text = passage.source.text;
                const from = binding.from ?? 0;
                const to = binding.to ?? text.length;
                const splitSurrogate = (offset: number) =>
                    offset > 0 &&
                    offset < text.length &&
                    /[\uD800-\uDBFF]/u.test(text[offset - 1]!) &&
                    /[\uDC00-\uDFFF]/u.test(text[offset]!);

                if (
                    to > text.length ||
                    from >= to ||
                    splitSurrogate(from) ||
                    splitSurrogate(to)
                ) {
                    throw new Error(
                        'The source range must identify an exact Unicode passage in the frozen selection.',
                    );
                }

                return { ...passage.source, text: text.slice(from, to) };
            }

            const block = context.blocks.find(
                (item) => item.id === binding.blockId,
            );
            const proposalId =
                context.proposalIds?.get(binding.blockId) ?? context.proposalId;
            const origin =
                context.capturedOrigins?.get(binding.blockId) ??
                (proposalId
                    ? {
                          kind: 'proposal' as const,
                          proposalId,
                          blockId: binding.blockId,
                      }
                    : { kind: 'block' as const, blockId: binding.blockId });

            if (binding.kind === 'vocabulary' && block?.type === 'vocabulary') {
                return {
                    kind: 'vocabulary',
                    origin,
                    entries: binding.entryIds.map((entryId) => {
                        const entry = block.entries.find(
                            (item) => item.id === entryId,
                        );

                        if (!entry) {
                            throw new Error(
                                'The selected vocabulary sense is unavailable.',
                            );
                        }

                        return {
                            entryId,
                            term: entry.term,
                            sense: vocabularyExerciseSourceSense(entry),
                        };
                    }),
                };
            }

            if (binding.kind === 'grammar' && block?.type === 'grammar') {
                return {
                    kind: 'grammar',
                    origin,
                    rule: grammarExerciseSourceRule(block),
                };
            }

            if (binding.kind === 'text' && block?.type === 'bilingual-text') {
                return {
                    kind: 'text',
                    origin,
                    passages: binding.segmentIds.map((segmentId) => {
                        const passage = block.segments.find(
                            (item) => item.id === segmentId,
                        );

                        if (!passage) {
                            throw new Error(
                                'The selected reading passage is unavailable.',
                            );
                        }

                        return { segmentId, text: passage.text };
                    }),
                };
            }

            throw new Error(
                'The exercise source does not identify authorized content.',
            );
        },
    );
    const { sourceBindings: _bindings, ...block } = wire;
    let normalized: unknown = block;
    if (
        wire.format === 'multiple-choice' &&
        wire.semantics.activity.id === 'R03' &&
        'key' in wire.semantics.checking &&
        wire.semantics.checking.key.kind === 'choice'
    ) {
        const classification = wire.semantics.checking.key.classification;
        if (!classification || wire.choices.length !== 3) {
            throw new Error(
                'R03 requires exactly three declared classification roles.',
            );
        }

        const labels = ['True', 'False', 'Not stated'] as const;
        const choices = classification.roles.map((role, index) => {
            const choice = wire.choices.find(
                (item) => item.id === role.choiceId,
            );

            if (!choice) {
                throw new Error('R03 roles must identify the actual choices.');
            }

            return { ...choice, text: labels[index]! };
        });
        const correct = choices.find(
            (choice) => choice.id === wire.correctChoiceId,
        );

        if (!correct) {
            throw new Error(
                'R03 correct classification must identify an actual role.',
            );
        }

        normalized = {
            ...block,
            choices,
            referenceAnswer: correct.text,
            ...(classification.absenceRationale &&
            correct.id === classification.roles[2]?.choiceId
                ? { explanation: classification.absenceRationale }
                : {}),
        };
    }

    return LearningBlockSchema.parse({
        ...(normalized as Record<string, unknown>),
        semantics: { ...wire.semantics, sources },
    });
}
