import { learningContentProseText } from '../../application/learning-content-prose';
import { createHash } from 'node:crypto';
import {
    type ExercisePublicationContext,
    compileExercisePayload,
    parseExercisePayload,
    namedExerciseAuthoringSchemaForBrief as payloadSchemaForBrief,
} from './exercise-authoring-payload';

import {
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

/** A generated passage and a bilingual block are both reading material, but
 * only the latter has block and segment handles that a candidate may select. */
export function namedExerciseAuthoringSchemaForBrief(
    brief: LearningContentBrief,
    contexts?: ReadonlyMap<string, ExerciseAuthoringSource>,
) {
    if (!contexts) {
        return payloadSchemaForBrief(brief);
    }

    const bindings = new Map(
        [...contexts].map(([taskId, context]) => {
            const kinds = new Set<
                'text-selection' | 'text' | 'vocabulary' | 'grammar'
            >();

            if (sourcePassages(context).length) {
                kinds.add('text-selection');
            }

            for (const block of context.blocks) {
                if (block.type === 'bilingual-text') {
                    kinds.add('text');
                }

                if (block.type === 'grammar' || block.type === 'vocabulary') {
                    kinds.add(block.type);
                }
            }

            return [taskId, kinds] as const;
        }),
    );

    return payloadSchemaForBrief(brief, bindings);
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
    publication: ExercisePublicationContext,
): LearningBlock {
    const wire = parseExercisePayload(value);
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

    return compileExercisePayload(wire, sources, publication);
}
