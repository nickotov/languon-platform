import {
    GenerationRunPreviewSchema,
    LearningBlockSchema,
    type KnowledgeBody,
    type LearningBlock,
} from '@languon/contracts';
import type { ConversationAccess } from '../../../application/ports/conversation-store';
import { conversationUnavailable } from '../../../domain/conversation';
import {
    generationContext,
    generationOwnerContext,
    lockGenerationRun,
} from './generation-run-context';
import { conversationReadTransaction } from './conversation-persistence-authority';
import type { ConversationPersistenceContext } from './conversation-persistence-context';

function bodyBlocks(body: KnowledgeBody): LearningBlock[] {
    return (body.document.content ?? []).flatMap((node) =>
        node.type === 'learningBlock'
            ? [LearningBlockSchema.parse(node.attrs?.block)]
            : [],
    );
}

/** Read projections use current authorization, never artifact IDs supplied by callers. */
export function conversationGetGenerationRunPreview(
    persistence: ConversationPersistenceContext,
    access: ConversationAccess,
    conversationId: string,
    runId: string,
) {
    return conversationReadTransaction(persistence, async (tx) => {
        await generationOwnerContext(
            persistence,
            tx,
            access,
            conversationId,
            false,
        );

        const run = await lockGenerationRun(
            tx,
            conversationId,
            runId,
            access.ownerId,
        );

        if (run.state === 'discarded') {
            throw conversationUnavailable();
        }

        const context = await generationContext(tx, run);
        const latest = new Map(
            context.artifacts.map((artifact) => [artifact.taskId, artifact]),
        );
        const parts = context.plan.outputOrder.flatMap((taskId) => {
            const artifact = latest.get(taskId);
            if (!artifact) {
                return [];
            }

            const task = context.plan.tasks.find((item) => item.id === taskId)!;
            const totalUnitCount =
                task.kind === 'exercises'
                    ? task.activities.reduce(
                          (sum, activity) => sum + activity.count,
                          0,
                      )
                    : task.kind === 'vocabulary'
                      ? (task.words?.length ?? task.count)
                      : 1;
            const completedUnitCount =
                task.kind === 'exercises'
                    ? bodyBlocks(artifact.body).filter(
                          (block) => block.type === 'exercise',
                      ).length
                    : task.kind === 'vocabulary'
                      ? bodyBlocks(artifact.body).reduce(
                            (count, block) =>
                                count +
                                (block.type === 'vocabulary'
                                    ? block.entries.length
                                    : 0),
                            0,
                        )
                      : 1;

            return [
                {
                    taskId,
                    body: artifact.body,
                    completedUnitCount,
                    totalUnitCount,
                    complete: artifact.taskComplete,
                },
            ];
        });
        const present = new Set(
            parts.flatMap((part) =>
                bodyBlocks(part.body).map((block) => block.id),
            ),
        );
        const referenced = new Set<string>();
        function collectReferences(value: unknown): void {
            if (!value || typeof value !== 'object') {
                return;
            }

            if ('blockId' in value && typeof value.blockId === 'string') {
                referenced.add(value.blockId);
            }

            Object.values(value).forEach(collectReferences);
        }

        parts.forEach((part) => collectReferences(part.body));
        const dependencies = new Map<string, LearningBlock>();
        for (const source of context.sources) {
            for (const block of source.blocks) {
                if (!present.has(block.id) && referenced.has(block.id)) {
                    dependencies.set(block.id, block);
                }
            }
        }

        return GenerationRunPreviewSchema.parse({
            runId: run.id,
            revision: run.revision,
            parts,
            ...(dependencies.size
                ? { dependencies: [...dependencies.values()] }
                : {}),
        });
    });
}
