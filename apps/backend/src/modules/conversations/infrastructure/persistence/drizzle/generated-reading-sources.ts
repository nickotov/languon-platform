import { readingFromPart } from '../../../application/generated-reading';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { KnowledgeContentProposalSchema } from '@languon/contracts';
import type { GeneratedReading } from '../../../application/ports/tutor-runner';
import type { ClaimedConversationTurn } from '../../../application/ports/conversation-store';
import { isReadOnlyKnowledgeSource } from '../../../domain/conversation';
import { generationRunsTable as runs } from './conversation-generation-schema';
import { conversationWithOperation } from './conversation-worker-authority';
import type { ConversationPersistenceContext } from './conversation-persistence-context';
import { loadLessonPartLayouts } from './lesson-proposal-parts';

export function readGeneratedReadings(
    persistence: ConversationPersistenceContext,
    turn: ClaimedConversationTurn,
) {
    return conversationWithOperation(persistence, turn, async (tx) => {
        const branchId = turn.sourceSnapshot.blockTarget?.branchId;
        if (
            !branchId ||
            turn.source.kind !== 'knowledge' ||
            isReadOnlyKnowledgeSource(turn.source) ||
            turn.authority.sourceOwnerId !== turn.ownerId
        ) {
            return [];
        }

        const recent = await tx
            .select({ id: runs.id, proposalId: runs.proposalId })
            .from(runs)
            .where(
                and(
                    eq(runs.ownerId, turn.ownerId),
                    eq(runs.conversationId, turn.conversationId),
                    eq(runs.noteId, turn.source.id),
                    eq(runs.state, 'completed'),
                    sql`${runs.sourceSnapshot}->'blockTarget'->>'branchId' = ${branchId}`,
                    isNotNull(runs.proposalId),
                    sql`(${runs.taskManifest} @> '[{"kind":"prose"}]'::jsonb or ${runs.taskManifest} @> '[{"kind":"bilingual-text"}]'::jsonb)`,
                ),
            )
            .orderBy(desc(runs.createdAt), desc(runs.id))
            .limit(8);
        const layouts = await loadLessonPartLayouts(
            tx,
            recent.map((run) => run.id),
        );
        const readings: GeneratedReading[] = [];
        for (const run of recent) {
            // Use the ordinary owner- and lease-fenced proposal reader. The worker has no general proposal-table grant.
            const proposal = await tx
                .transaction(async (nested) => {
                    const result = await nested.execute(
                        sql`select public.languon_read_learning_content_proposal(${turn.id}::uuid,${turn.leaseToken}::uuid,${run.proposalId}::uuid) as snapshot`,
                    );

                    return KnowledgeContentProposalSchema.parse(
                        result[0]?.['snapshot'],
                    );
                })
                .catch((error: unknown) => {
                    const cause =
                        error instanceof Error ? error.cause : undefined;
                    if (
                        cause instanceof Error &&
                        'code' in cause &&
                        cause.code === '23514' &&
                        cause.message === 'The proposal is unavailable'
                    ) {
                        return null;
                    }

                    throw error;
                });

            if (!proposal || proposal.branchId !== branchId) {
                continue;
            }

            for (const part of layouts.get(run.id) ?? []) {
                const reading = readingFromPart(
                    proposal.id,
                    part,
                    proposal.body.document.content ?? [],
                );

                if (reading) {
                    readings.push({
                        ...reading,
                        publishedAt: proposal.createdAt,
                    });
                }

                if (readings.length === 8) {
                    return readings;
                }
            }
        }

        return readings;
    });
}
