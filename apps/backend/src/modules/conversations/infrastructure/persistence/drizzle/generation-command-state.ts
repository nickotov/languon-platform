import { and, desc, eq, sql } from 'drizzle-orm';
import { uncertainGenerationFailureCode } from '../../../application/generation-failure';
import {
    generationRunActionsTable as actions,
    generationPlanRevisionsTable as revisions,
} from './conversation-generation-schema';
import { conversationTurnsTable as turns } from './schema';
import type { ConversationsTransaction } from './conversation-source';

/**
 * Only provider-backed run actions and their acknowledged replacements participate.
 * Comparing immutable attempt IDs avoids relying on completion timestamps or mutable
 * card state (Stop, source choices and plan revisions can change that state).
 */
async function unresolvedGenerationTurn(
    tx: ConversationsTransaction,
    runId: string,
) {
    const [unresolved] = await tx.execute<{ id: string }>(sql`
        select attempt.turn_id as id
        from ${actions} attempt
        join ${turns} failed on failed.id = attempt.turn_id
        where attempt.run_id = ${runId}::uuid and (failed.failure_code = ${uncertainGenerationFailureCode}
            or (failed.status in ('cancelled','failed') and exists (
                select 1 from ${revisions} r, jsonb_array_elements(r.unit_attempts) u
                where r.run_id = attempt.run_id and r.revision = attempt.revision and u->>'turnId' = failed.id::text and u->>'outcome' = 'started'
            )))
        and not exists (
            select 1 from ${actions} replacement
            join ${turns} admitted on admitted.id = replacement.turn_id
            where replacement.run_id = attempt.run_id
            and admitted.execution->>'acknowledgedUncertainTurnId' = failed.id::text
        )
        limit 1`);

    return unresolved?.id;
}

export async function generationCommandState(
    tx: ConversationsTransaction,
    runId: string,
) {
    // The run lock serializes explicit command admission. This ordinal remains
    // ordered across identical wall-clock timestamps and excludes worker stages.
    const ordinal = sql<number>`(${turns.execution}->>'generationCommandNumber')::integer`;
    const [latest] = await tx
        .select({ requestId: turns.requestId, ordinal })
        .from(actions)
        .innerJoin(turns, eq(turns.id, actions.turnId))
        .where(
            and(
                eq(actions.runId, runId),
                sql`${turns.execution} ? 'generationCommandNumber'`,
            ),
        )
        .orderBy(desc(ordinal))
        .limit(1);

    return {
        uncertainTurnId: await unresolvedGenerationTurn(tx, runId),
        lastCommandRequestId: latest?.requestId,
        nextCommandNumber: (latest?.ordinal ?? 0) + 1,
    };
}
