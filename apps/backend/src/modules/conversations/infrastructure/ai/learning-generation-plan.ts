import { generationTaskCapturedText } from '../../application/learning-content-plan-sources';
import { generationFingerprint } from '../../application/generation-run-revisions';
import { createHash } from 'node:crypto';
import {
    GenerationPlanSchema,
    LearningBlockSchema,
    type GenerationPlan,
    type CapturedBlockOrigin,
    type GenerationTask,
    type KnowledgeBody,
    type LearningBlock,
} from '@languon/contracts';
import type {
    LearningContentBrief,
    LearningContentTask,
} from '../../application/learning-content-contract';
import type { LearningContentTaskResult } from '../../application/learning-content-batch-results';
import type {
    GenerationArtifact,
    GenerationExecutionContext,
    GenerationSourceSnapshot,
} from '../../application/ports/generation-run';
import type { ExerciseAuthoringSource } from './exercise-authoring-context';

export const generationHash = generationFingerprint;
export const resultBody = (result: LearningContentTaskResult): KnowledgeBody =>
    result.prose ?? {
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: result.blocks.map((block) => ({
                type: 'learningBlock',
                attrs: { block },
            })),
        },
    };
export function bodyBlocks(body: KnowledgeBody): LearningBlock[] {
    return (body.document.content ?? []).flatMap((node) =>
        node.type === 'learningBlock'
            ? [LearningBlockSchema.parse(node.attrs?.block)]
            : [],
    );
}

/** Freeze executable requirements after all clarification/default/source decisions. */
export function createGenerationPlan(
    brief: LearningContentBrief,
    contexts: ReadonlyMap<string, ExerciseAuthoringSource>,
    replyLanguage: string,
): { plan: GenerationPlan; sources: GenerationSourceSnapshot[] } {
    const sources: GenerationSourceSnapshot[] = [];
    const descriptors: GenerationPlan['sources'] = [];
    const tasks = brief.tasks.map((task) => {
        const inputs: GenerationTask['inputs'] = [];
        for (const id of new Set([
            ...(task.source?.kind === 'task' ? [task.source.taskId] : []),
            ...(task.dependencies ?? []),
        ])) {
            inputs.push({ kind: 'task', taskId: id });
        }

        const context = contexts.get(task.id);
        if (context) {
            for (const block of context.blocks) {
                const kind =
                    block.type === 'bilingual-text'
                        ? 'text'
                        : block.type === 'grammar' ||
                            block.type === 'vocabulary' ||
                            (block.type === 'audio' &&
                                block.assetId &&
                                block.transcript?.segments.length)
                          ? block.type
                          : undefined;

                if (!kind) {
                    continue;
                }

                const id = `source-${descriptors.length + 1}`;
                const proposalId =
                    context.proposalIds?.get(block.id) ?? context.proposalId;

                descriptors.push({
                    id,
                    kind,
                    reference: proposalId
                        ? { kind: 'proposal', proposalId, blockId: block.id }
                        : { kind: 'block', blockId: block.id },
                });

                sources.push({
                    sourceId: id,
                    blocks: [block],
                    ...(proposalId ? { proposalId } : {}),
                });

                inputs.push({ kind: 'source', sourceId: id });
            }

            if (context.selection) {
                const id = `source-${descriptors.length + 1}`;
                descriptors.push({
                    id,
                    kind: 'text',
                    reference: { kind: 'selection' },
                });

                sources.push({
                    sourceId: id,
                    blocks: [],
                    selection: context.selection,
                });

                inputs.push({ kind: 'source', sourceId: id });
            }
        }

        if (context?.providedText) {
            const id = `source-${descriptors.length + 1}`;
            descriptors.push({
                id,
                kind: 'text',
                reference: {
                    kind: 'provided-text',
                    materialId: context.providedText.materialId,
                },
            });

            sources.push({
                sourceId: id,
                blocks: [],
                providedText: context.providedText,
            });

            inputs.push({ kind: 'source', sourceId: id });
        }

        const common = {
            id: task.id,
            kind: task.kind,
            ...(task.kind === 'audio'
                ? {
                      speakerCount: task.speakerCount ?? 1,
                      ...(task.maxDurationSeconds !== undefined && {
                          maxDurationSeconds: task.maxDurationSeconds,
                      }),
                  }
                : {}),
            instruction: task.instruction,
            language: task.language,
            inputs,
            ...(task.difficulty ? { difficulty: task.difficulty } : {}),
            ...(task.kind !== 'exercises' && !inputs.length && task.sourceText
                ? { sourceText: task.sourceText }
                : {}),
            ...((task.kind === 'prose' || task.kind === 'bilingual-text') &&
            task.targetWords
                ? { targetWords: task.targetWords }
                : {}),
        };

        if (task.kind === 'vocabulary') {
            return {
                ...common,
                translationLanguage: task.translationLanguage,
                count: task.count,
                ...(task.words ? { words: task.words } : {}),
            };
        }

        if (task.kind === 'bilingual-text') {
            return { ...common, translationLanguage: task.translationLanguage };
        }

        if (task.kind === 'grammar') {
            return {
                ...common,
                explanationLanguage: task.explanationLanguage ?? task.language,
            };
        }

        if (task.kind === 'exercises') {
            return {
                ...common,
                explanationLanguage: task.explanationLanguage ?? task.language,
                activities: task.activities,
            };
        }

        return common;
    });

    return {
        plan: GenerationPlanSchema.parse({
            schemaVersion: 1,
            replyLanguage,
            tasks,
            sources: descriptors,
            outputOrder:
                brief.outputOrder ?? brief.tasks.map((task) => task.id),
        }),
        sources,
    };
}

/** A prepared plan executes from immutable snapshots, independently of chat history. */
export function restoreGenerationExecution(
    context: GenerationExecutionContext,
) {
    const plan = GenerationPlanSchema.parse(context.plan);
    const taskSources = new Map<string, ExerciseAuthoringSource>();
    const tasks: LearningContentTask[] = plan.tasks.map((task) => {
        const snapshots = task.inputs.flatMap((input) =>
            input.kind === 'source'
                ? context.sources.filter(
                      (source) => source.sourceId === input.sourceId,
                  )
                : [],
        );
        const blocks = snapshots.flatMap((source) => source.blocks);
        const proposalIds = new Map(
            snapshots.flatMap((source) =>
                source.proposalId
                    ? source.blocks.map(
                          (block) => [block.id, source.proposalId!] as const,
                      )
                    : [],
            ),
        );
        const passages: NonNullable<ExerciseAuthoringSource['passages']> =
            snapshots.flatMap<
                NonNullable<ExerciseAuthoringSource['passages']>[number]
            >((source) => {
                if (source.selection) {
                    return [
                        {
                            id: source.sourceId,
                            source: {
                                kind: 'text-selection' as const,
                                origin: {
                                    noteId: source.selection.noteId,
                                    noteVersion: source.selection.noteVersion,
                                },
                                text: source.selection.text,
                            },
                        },
                    ];
                }

                if (source.providedText) {
                    return [
                        {
                            id: source.sourceId,
                            source: {
                                kind: 'provided-text' as const,
                                origin: {
                                    kind: 'provided-material' as const,
                                    materialId: source.providedText.materialId,
                                    contentHash: createHash('sha256')
                                        .update(source.providedText.text)
                                        .digest('hex'),
                                },
                                text: source.providedText.text,
                            },
                        },
                    ];
                }

                return [];
            });

        const capturedOrigins = new Map<string, CapturedBlockOrigin>(
            snapshots.flatMap((source) =>
                source.proposalId
                    ? []
                    : source.blocks.map(
                          (block) =>
                              [
                                  block.id,
                                  {
                                      kind: 'captured-block',
                                      runId: context.runId,
                                      revision: context.revision,
                                      sourceId: source.sourceId,
                                      blockId: block.id,
                                      contentHash: generationFingerprint(block),
                                  },
                              ] as const,
                      ),
            ),
        );

        taskSources.set(task.id, {
            blocks,
            capturedOrigins,
            passages,
            ...(proposalIds.size ? { proposalIds } : {}),
        });

        const dependencies = task.inputs.flatMap((input) =>
            input.kind === 'task' ? [input.taskId] : [],
        );

        const capturedText =
            task.kind === 'bilingual-text' || task.kind === 'audio'
                ? generationTaskCapturedText(task.inputs, context.sources)
                : '';

        return {
            id: task.id,
            kind: task.kind,
            ...(task.kind === 'audio'
                ? {
                      speakerCount: task.speakerCount ?? 1,
                      ...(task.maxDurationSeconds !== undefined && {
                          maxDurationSeconds: task.maxDurationSeconds,
                      }),
                  }
                : {}),
            instruction: task.instruction,
            language: task.language,
            ...(task.difficulty ? { difficulty: task.difficulty } : {}),
            ...(!task.inputs.length && 'sourceText' in task && task.sourceText
                ? { sourceText: task.sourceText }
                : {}),
            ...(capturedText ? { sourceText: capturedText } : {}),
            ...('targetWords' in task && task.targetWords
                ? { targetWords: task.targetWords }
                : {}),
            ...('translationLanguage' in task
                ? { translationLanguage: task.translationLanguage }
                : {}),
            ...('explanationLanguage' in task
                ? { explanationLanguage: task.explanationLanguage }
                : {}),
            ...('words' in task && task.words ? { words: task.words } : {}),
            ...('count' in task ? { count: task.count } : {}),
            ...(task.kind === 'exercises'
                ? {
                      activities: task.activities,
                      count: task.activities.reduce(
                          (sum, activity) => sum + activity.count,
                          0,
                      ),
                  }
                : {}),
            ...(dependencies[0]
                ? {
                      source: {
                          kind: 'task' as const,
                          taskId: dependencies[0],
                      },
                      dependencies,
                  }
                : {}),
        };
    });
    // Later checkpoints contain the complete validated task prefix, not delta appends.
    const latest = new Map<string, GenerationArtifact>();
    context.artifacts.forEach((artifact) =>
        latest.set(artifact.taskId, artifact),
    );

    const completed: LearningContentTaskResult[] = [...latest.values()].map(
        (artifact) => {
            const task = tasks.find(
                (candidate) => candidate.id === artifact.taskId,
            )!;

            return {
                taskId: artifact.taskId,
                blocks: bodyBlocks(artifact.body),
                ...(task.kind === 'prose'
                    ? {
                          prose: artifact.body,
                          generatedOrigin: {
                              kind: 'generated-artifact' as const,
                              runId: context.runId,
                              revision: artifact.revision,
                              taskId: task.id,
                              artifactId: artifact.id,
                              contentHash: artifact.contentHash,
                          },
                      }
                    : {}),
            };
        },
    );

    return {
        brief: { tasks, outputOrder: plan.outputOrder },
        taskSources,
        completed,
        completedTaskIds: [...latest.values()]
            .filter((artifact) => artifact.taskComplete)
            .map((artifact) => artifact.taskId),
        completedBatchKeys: [
            ...new Set(context.artifacts.map((artifact) => artifact.batchKey)),
        ],
    };
}
