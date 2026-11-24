import { sql } from 'drizzle-orm';
import type { ConversationsTransaction } from './conversation-source';
import {
    generationRunActionsTable as actions,
    generationRunArtifactsTable as artifacts,
    generationPlanRevisionsTable as revisions,
} from './conversation-generation-schema';
import type { GenerationRunRow } from './generation-run-context';

/** Starting the plan itself is durable work. A continuation must save its own
 * artifact, even when the current revision still contains no completed units. */
export async function generationStageHasProgress(
    tx: ConversationsTransaction,
    run: GenerationRunRow,
    turnId: string,
) {
    const [result] = await tx.execute(sql`
        select exists(select 1 from ${artifacts} where ${artifacts.turnId} = ${turnId}::uuid)
            or exists(select 1 from ${revisions} r, jsonb_array_elements(r.unit_attempts) u where r.run_id = ${run.id}::uuid and r.revision = ${run.revision} and u->>'turnId' = ${turnId} and u->>'outcome' = 'rejected')
            or (${run.revision} = 1 and not exists(
                select 1 from ${actions}
                where ${actions.runId} = ${run.id}::uuid and ${actions.turnId} <> ${turnId}::uuid
            )) as progress
    `);

    return result?.['progress'] === true;
}
