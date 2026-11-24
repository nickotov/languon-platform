import { automaticRequestId } from './generation-request-id';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { generationAdmissionOutcome } from '../../../application/generation-admission-outcome';
import { ConversationError } from '../../../domain/conversation';
import { KnowledgeDomainError } from '../../../../knowledge/domain/knowledge';
import { generationRunsTable as runs } from './conversation-generation-schema';
import { conversationSubmit } from './conversation-turn-admission';
import { conversationTransaction } from './conversation-persistence-authority';
import { emitGenerationRun } from './generation-run-context';
import type { ConversationPersistenceContext } from './conversation-persistence-context';

type Run = typeof runs.$inferSelect;
type Authority = NonNullable<Run['automation']>;
const workerQuarantine = new WeakMap<
    ConversationPersistenceContext,
    Map<string, number>
>();

function admissionFence(candidate: Run, authority: Authority) {
    return and(
        eq(runs.id, candidate.id),
        eq(runs.revision, candidate.revision),
        eq(runs.state, 'paused'),
        sql`${runs.automation}->>'ready' = 'true'`,
        sql`${runs.automation}->>'authorizationId' = ${authority.authorizationId}`,
        sql`${runs.automation}->>'stageCount' = ${String(authority.stageCount)}`,
        sql`coalesce(${runs.automation}->'admissionRetry'->>'count','0') = ${String(authority.admissionRetry?.count ?? 0)}`,
    );
}

function report(
    runId: string,
    requestId: string,
    phase: 'admit' | 'record-outcome' | 'quarantine',
) {
    console.warn('Lesson automatic admission failed.', {
        runId,
        requestId,
        phase,
    });
}

async function processCandidate(
    persistence: ConversationPersistenceContext,
    candidate: Run,
    authority: Authority,
    quarantine: Map<string, number>,
) {
    const requestId = automaticRequestId(
        `${candidate.id}:${authority.authorizationId}:${authority.stageCount}`,
    );
    let code: string;
    try {
        await conversationSubmit(
            persistence,
            { ownerId: candidate.ownerId },
            candidate.conversationId,
            {
                requestId,
                content: 'Continue the prepared lesson.',
                attachments: [],
            },
            {
                runId: candidate.id,
                expectedRevision: candidate.revision,
                kind: 'generation',
                automatic: {
                    authorizationId: authority.authorizationId,
                    stageCount: authority.stageCount,
                    retryCount: authority.admissionRetry?.count ?? 0,
                },
            },
        );

        return 'admitted';
    } catch (error) {
        if (error instanceof ConversationError) {
            code = error.code;
        } else if (
            error instanceof KnowledgeDomainError &&
            error.code === 'knowledge_not_found'
        ) {
            code = 'conversation_not_found';
        } else {
            // The acknowledgement itself could be lost. The stage fence below checks
            // whether this authority is still waiting before writing any failure.
            code = 'automatic_admission_failed';
            report(candidate.id, requestId, 'admit');
        }
    }

    const now = persistence.now();
    const fence = admissionFence(candidate, authority);
    try {
        await conversationTransaction(persistence, async (tx) => {
            const outcome = generationAdmissionOutcome(
                code,
                authority,
                now,
                requestId,
            );
            const [changed] = await tx
                .update(runs)
                .set({ ...outcome, updatedAt: now })
                .where(fence)
                .returning({ id: runs.id });

            if (changed) {
                await emitGenerationRun(persistence, tx, candidate.id);
            }
        });
    } catch {
        report(candidate.id, requestId, 'record-outcome');
        // A broken summary or event write can roll back an otherwise valid pause.
        // Fence further spending in a separate minimal write; reconnect reads its result.
        try {
            await persistence.dependencies.database
                .update(runs)
                .set({
                    automation: null,
                    pauseReason: 'technical-failure',
                    updatedAt: now,
                    failure: {
                        code: 'admission-blocked',
                        admissionReason: 'unknown',
                        referenceId: requestId,
                    },
                })
                .where(fence);
        } catch {
            // Even when the store cannot accept the quarantine, continue other work
            // and bound how often this worker can log/revisit the same damaged row.
            report(candidate.id, requestId, 'quarantine');
            if (quarantine.size >= 128) {
                quarantine.delete(quarantine.keys().next().value!);
            }

            quarantine.set(candidate.id, now.getTime() + 60_000);
        }
    }

    return code;
}

/** Opens a bounded page; global discovery failures surface to worker health monitoring. */
export async function admitAutomaticGeneration(
    persistence: ConversationPersistenceContext,
    scope: 'text' | 'recording' = 'text',
) {
    const now = persistence.now();
    const quarantine =
        workerQuarantine.get(persistence) ?? new Map<string, number>();

    workerQuarantine.set(persistence, quarantine);
    for (const [id, until] of quarantine) {
        if (until <= now.getTime()) {
            quarantine.delete(id);
        }
    }

    const pending = await persistence.dependencies.database
        .select()
        .from(runs)
        .where(
            and(
                eq(runs.state, 'paused'),
                eq(runs.pauseReason, 'budget'),
                // Recording admission reads API-owned financial grants. Its maintenance
                // loop uses the same fenced command under the actor database role.
                scope === 'recording'
                    ? sql`${runs.taskManifest} @> '[{"kind":"audio"}]'::jsonb`
                    : sql`not (${runs.taskManifest} @> '[{"kind":"audio"}]'::jsonb)`,
                sql`${runs.automation}->>'ready' = 'true'`,
                sql`coalesce(${runs.automation}->'admissionRetry'->>'retryAt', '') <= ${now.toISOString()}`,
                quarantine.size
                    ? notInArray(runs.id, [...quarantine.keys()])
                    : undefined,
            ),
        )
        .orderBy(asc(runs.updatedAt), asc(runs.id))
        .limit(10);
    const outcomes: { runId: string; code: string }[] = [];
    for (const candidate of pending) {
        if (candidate.automation) {
            const code = await processCandidate(
                persistence,
                candidate,
                candidate.automation,
                quarantine,
            );

            outcomes.push({ runId: candidate.id, code });
        }
    }

    return outcomes;
}
