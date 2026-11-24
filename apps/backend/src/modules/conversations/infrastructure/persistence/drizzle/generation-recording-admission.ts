import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { generationAdmissionOutcome } from '../../../application/generation-admission-outcome';
import {
    ConversationActionConfirmationRequired,
    ConversationError,
} from '../../../domain/conversation';
import { generationRunsTable as runs } from './conversation-generation-schema';
import type { ConversationPersistenceContext } from './conversation-persistence-context';
import { conversationTransaction } from './conversation-persistence-authority';
import { emitGenerationRun } from './generation-run-context';
import { conversationContinueGenerationRun } from './generation-run-queries';
import { recordingAdmissionRequestId } from './generation-request-id';

/** The actor-capable API admits the saved plan after its planning action settles.
 * A stable command ID and row-locked admission protect concurrent API instances and lost responses. */
export async function prepareNextRecordingLesson(
    persistence: ConversationPersistenceContext,
) {
    const now = persistence.now();
    const pending = and(
        eq(runs.state, 'paused'),
        eq(runs.pauseReason, 'recording-confirmation'),
        isNull(sql`${runs.automation}->'recordingApproval'`),
    );
    const [run] = await persistence.dependencies.database
        .select()
        .from(runs)
        .where(
            and(
                pending,
                sql`coalesce(${runs.automation}->'admissionRetry'->>'retryAt','') <= ${now.toISOString()}`,
            ),
        )
        .orderBy(asc(runs.updatedAt), asc(runs.id))
        .limit(1);

    if (!run) {
        return;
    }

    const requestId = recordingAdmissionRequestId(run.id, run.revision);
    try {
        await conversationContinueGenerationRun(
            persistence,
            { ownerId: run.ownerId },
            run.conversationId,
            run.id,
            { requestId, expectedRevision: run.revision },
        );
    } catch (error) {
        const authority = run.automation;
        if (error instanceof ConversationActionConfirmationRequired) {
            // Admission already committed the offer and its SSE projection.
            return;
        }

        const code =
            error instanceof ConversationError ? error.code : 'unknown';
        const outcome = authority
            ? generationAdmissionOutcome(code, authority, now, requestId)
            : undefined;
        const update = outcome?.automation
            ? { automation: { ...outcome.automation, ready: false } }
            : {
                  automation: null,
                  pauseReason:
                      outcome?.pauseReason ?? ('technical-failure' as const),
                  failure: outcome?.failure ?? {
                      code: 'admission-blocked' as const,
                      admissionReason: 'unknown' as const,
                      referenceId: requestId,
                  },
              };

        await conversationTransaction(persistence, async (tx) => {
            const [changed] = await tx
                .update(runs)
                .set({ ...update, updatedAt: now })
                .where(
                    and(
                        pending,
                        eq(runs.id, run.id),
                        eq(runs.revision, run.revision),
                        sql`coalesce(${runs.automation}->'admissionRetry'->>'count','0') = ${String(authority?.admissionRetry?.count ?? 0)}`,
                    ),
                )
                .returning({ id: runs.id });

            if (changed) {
                await emitGenerationRun(persistence, tx, run.id);
            }
        });
    }
}
