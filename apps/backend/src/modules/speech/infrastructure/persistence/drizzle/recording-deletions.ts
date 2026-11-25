import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, gt, gte, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type { AiCreditTransaction } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../../../administration/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    AudioObjectReference,
    SpeechStore,
} from '../../../application/ports';
import { SpeechError } from '../../../domain/speech-policy';
import {
    speechBindingsTable as bindings,
    speechRecordingsTable as recordings,
} from '../../schema';
import { lockSpeechOperation } from './speech-operation-lock';

export async function markRecordingsDeleting(
    tx: AiCreditTransaction,
    input: Parameters<SpeechStore['markDeleting']>[0],
) {
    const [administrator] = await tx
        .select({ id: adminMembershipsTable.id })
        .from(adminMembershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, adminMembershipsTable.userId))
        .where(
            and(
                eq(adminMembershipsTable.userId, input.audit.actorId),
                eq(adminMembershipsTable.role, 'owner'),
                sql`${adminMembershipsTable.revokedAt} is null`,
                eq(usersTable.status, 'active'),
            ),
        )
        .for('share');

    if (!administrator) {
        throw new SpeechError('admin_access_denied');
    }

    const selected: { id: string; storage: AudioObjectReference }[] = [];

    for (const target of [...input.recordings].sort((a, b) =>
        a.id.localeCompare(b.id),
    )) {
        const [snapshot] = await tx
            .select()
            .from(recordings)
            .where(eq(recordings.id, target.id))
            .limit(1);

        if (!snapshot) {
            throw new SpeechError('speech_recording_not_found');
        }

        await lockSpeechOperation(tx, snapshot.canonicalKey);
        const [row] = await tx
            .select()
            .from(recordings)
            .where(eq(recordings.id, target.id))
            .limit(1)
            .for('update');
        const [linked] = await tx
            .select({ value: count() })
            .from(bindings)
            .where(eq(bindings.recordingId, target.id));

        if (
            !row ||
            row.version !== target.expectedVersion ||
            linked?.value !== target.expectedBindingCount ||
            !['ready', 'deleting', 'failed'].includes(row.state)
        ) {
            throw new SpeechError('speech_delete_impact_changed');
        }

        selected.push({ id: row.id, storage: row.storage });
    }

    for (const target of selected) {
        await tx
            .update(recordings)
            .set({
                state: 'deleting',
                text: '',
                version: sql`${recordings.version}+1`,
            })
            .where(eq(recordings.id, target.id));
    }

    await tx.insert(adminAuditEventsTable).values({
        id: randomUUID(),
        action: 'speech_recordings_deleted',
        actorUserId: input.audit.actorId,
        correlationId: input.audit.correlationId,
        reason: input.audit.reason,
        occurredAt: input.audit.occurredAt,
        expiresAt: new Date(
            input.audit.occurredAt.getTime() + 365 * 86_400_000,
        ),
        outcome: 'success',
        metadata: { recordingIds: selected.map((item) => item.id) },
    });

    return selected;
}

export async function finishRecordingDeletion(
    tx: AiCreditTransaction,
    recordingId: string,
    now: Date,
) {
    // Keep association IDs as idempotency tombstones until source/account
    // deletion. Erasing a consumed quote's binding would permit a replay
    // of the same confirmation to reserve/charge a second generation.
    await tx
        .update(recordings)
        .set({
            state: 'deleted',
            text: '',
            deletedAt: now,
            version: sql`${recordings.version}+1`,
        })
        .where(
            and(
                eq(recordings.id, recordingId),
                eq(recordings.state, 'deleting'),
            ),
        );
}

export async function listRecordingDeletions(
    database: PostgresJsDatabase<typeof databaseSchema>,
    cursor: string | null,
    now: Date,
) {
    // Cycle through durable tombstones so repeated verification of the first
    // page cannot starve later removals after more than 100 admin deletions.
    const pageSize = 100;
    const rows = await database
        .select({ id: recordings.id, storage: recordings.storage })
        .from(recordings)
        .where(
            and(
                or(
                    eq(recordings.state, 'deleting'),
                    and(
                        eq(recordings.state, 'deleted'),
                        gte(
                            recordings.deletedAt,
                            new Date(now.getTime() - 86_400_000),
                        ),
                    ),
                ),
                cursor ? gt(recordings.id, cursor) : undefined,
            ),
        )
        .orderBy(asc(recordings.id))
        .limit(pageSize);

    return {
        rows,
        nextCursor: rows.length === pageSize ? rows.at(-1)!.id : null,
    };
}
