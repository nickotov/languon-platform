import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
    KnowledgeBody,
    KnowledgeNode,
    LessonPart,
} from '@languon/contracts';
import { getExerciseActivity, isLessonPartPresent } from '@languon/contracts';
import {
    generationPlanRevisionsTable as revisions,
    generationRunsTable as runs,
    generationRunArtifactsTable as artifacts,
} from './conversation-generation-schema';
import { conflict } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';

/** Publication concatenates the last accepted artifact for each task in output order.
 * Read just their sizes; never infer boundaries from headings or exercise formats. */
export async function loadLessonPartLayouts(
    tx: ConversationsTransaction,
    ids: string[],
) {
    const layouts = new Map<string, LessonPart[]>();
    if (!ids.length) {
        return layouts;
    }

    const revisionsForRuns = await tx
        .select({
            runId: runs.id,
            plan: revisions.plan,
            artifactIds: revisions.artifactIds,
        })
        .from(runs)
        .innerJoin(
            revisions,
            and(
                eq(revisions.runId, runs.id),
                eq(revisions.revision, runs.revision),
            ),
        )
        .where(inArray(runs.id, ids));
    const rows = await tx
        .select({
            id: artifacts.id,
            runId: artifacts.runId,
            taskId: artifacts.taskId,
            count: sql<number>`jsonb_array_length(${artifacts.artifact}->'body'->'document'->'content')`,
            complete: sql<boolean>`(${artifacts.artifact}->>'taskComplete')::boolean`,
        })
        .from(artifacts)
        .where(inArray(artifacts.runId, ids));
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const revision of revisionsForRuns) {
        const sizes = new Map<string, number>();
        for (const id of revision.artifactIds) {
            const row = byId.get(id);
            if (row?.complete && row.runId === revision.runId) {
                sizes.set(row.taskId, row.count);
            }
        }

        let offset = 0;
        const parts: LessonPart[] = [];
        for (const taskId of revision.plan.outputOrder) {
            const task = revision.plan.tasks.find((task) => task.id === taskId);
            const nodeCount = sizes.get(taskId);
            if (!task || !nodeCount) {
                throw conflict('The completed lesson material is unavailable.');
            }

            const startIndex = offset;
            offset += nodeCount;

            const previous = parts.at(-1);
            if (
                previous?.kind === 'audio' &&
                task.kind === 'exercises' &&
                task.inputs.some(
                    (input) =>
                        input.kind === 'task' &&
                        input.taskId === previous.taskId,
                ) &&
                task.activities.every(
                    (activity) =>
                        getExerciseActivity(activity.activityId).category ===
                        'listening',
                )
            ) {
                previous.nodeCount += nodeCount;
                continue;
            }
            parts.push({
                taskId,
                kind: task.kind,
                startIndex,
                nodeCount,
                present: false,
            });
        }

        layouts.set(revision.runId, parts);
    }

    if (ids.some((id) => !layouts.has(id))) {
        throw conflict('The completed lesson material is unavailable.');
    }

    return layouts;
}

export function lessonPartsInDocument(
    proposal: { id: string; body: KnowledgeBody },
    parts: LessonPart[],
    document: KnowledgeNode,
) {
    const last = parts.at(-1);
    if (
        !last ||
        last.startIndex + last.nodeCount !==
            proposal.body.document.content?.length
    ) {
        throw conflict('The completed lesson no longer matches its proposal.');
    }

    return parts.map((part) => ({
        ...part,
        present: isLessonPartPresent(
            proposal.id,
            part,
            proposal.body,
            document,
        ),
    }));
}
