import type { DictionaryDeterministicImportResponse } from '@languon/contracts';
import { DictionaryDeterministicImportResponseSchema } from '@languon/contracts';
import { and, eq, lte, sql } from 'drizzle-orm';
import { DictionaryIdempotencyConflictError } from '../../../application/dictionary-errors';
import type {
    DictionaryOperationContext,
    DictionaryStore,
} from '../../../application/ports/dictionary-store';
import type {
    DictionaryPersistenceContext,
    DictionaryTransaction,
} from './dictionary-context';
import { idempotencyLifetimeMs } from './dictionary-context';
import { dictionaryIdempotencyKeysTable } from './schema';

export async function reserveIdempotency(
    context: DictionaryPersistenceContext,
    tx: DictionaryTransaction,
    input: {
        context: DictionaryOperationContext;
        fingerprint: string;
        idempotencyKey: string;
        ownerId: string;
    },
    operation: 'create' | 'fork',
): Promise<string | null> {
    await tx
        .delete(dictionaryIdempotencyKeysTable)
        .where(
            and(
                eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                eq(dictionaryIdempotencyKeysTable.operation, operation),
                eq(
                    dictionaryIdempotencyKeysTable.idempotencyKey,
                    input.idempotencyKey,
                ),
                lte(
                    dictionaryIdempotencyKeysTable.expiresAt,
                    input.context.now,
                ),
            ),
        );

    await tx.execute(sql`
            delete from ${dictionaryIdempotencyKeysTable}
            where ${dictionaryIdempotencyKeysTable.id} in (
                select ${dictionaryIdempotencyKeysTable.id}
                from ${dictionaryIdempotencyKeysTable}
                where ${dictionaryIdempotencyKeysTable.expiresAt} <= ${input.context.now.toISOString()}::timestamptz
                order by ${dictionaryIdempotencyKeysTable.expiresAt}
                limit 100
                for update skip locked
            )
        `);

    const [inserted] = await tx
        .insert(dictionaryIdempotencyKeysTable)
        .values({
            createdAt: input.context.now,
            expiresAt: new Date(
                input.context.now.getTime() + idempotencyLifetimeMs,
            ),
            id: context.ids.generate(),
            idempotencyKey: input.idempotencyKey,
            operation,
            ownerId: input.ownerId,
            requestFingerprint: input.fingerprint,
            updatedAt: input.context.now,
        })
        .onConflictDoNothing({
            target: [
                dictionaryIdempotencyKeysTable.ownerId,
                dictionaryIdempotencyKeysTable.operation,
                dictionaryIdempotencyKeysTable.idempotencyKey,
            ],
        })
        .returning({ id: dictionaryIdempotencyKeysTable.id });

    if (inserted) return null;
    const [existing] = await tx
        .select()
        .from(dictionaryIdempotencyKeysTable)
        .where(
            and(
                eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                eq(dictionaryIdempotencyKeysTable.operation, operation),
                eq(
                    dictionaryIdempotencyKeysTable.idempotencyKey,
                    input.idempotencyKey,
                ),
            ),
        )
        .limit(1)
        .for('update');

    if (
        !existing ||
        existing.requestFingerprint !== input.fingerprint ||
        existing.state !== 'completed' ||
        !existing.resultDictionaryId
    )
        throw new DictionaryIdempotencyConflictError();

    return existing.resultDictionaryId;
}

export async function completeIdempotency(
    tx: DictionaryTransaction,
    ownerId: string,
    operation: 'create' | 'fork',
    key: string,
    dictionaryId: string,
    now: Date,
) {
    await tx
        .update(dictionaryIdempotencyKeysTable)
        .set({
            completedAt: now,
            resultDictionaryId: dictionaryId,
            state: 'completed',
            updatedAt: now,
        })
        .where(
            and(
                eq(dictionaryIdempotencyKeysTable.ownerId, ownerId),
                eq(dictionaryIdempotencyKeysTable.operation, operation),
                eq(dictionaryIdempotencyKeysTable.idempotencyKey, key),
                eq(dictionaryIdempotencyKeysTable.state, 'in_progress'),
            ),
        );
}

export async function reserveBulkIdempotency(
    context: DictionaryPersistenceContext,
    tx: DictionaryTransaction,
    input: Pick<
        Parameters<DictionaryStore['importDictionary']>[0],
        'context' | 'fingerprint' | 'idempotencyKey' | 'ownerId'
    >,
): Promise<DictionaryDeterministicImportResponse | null> {
    await tx
        .delete(dictionaryIdempotencyKeysTable)
        .where(
            and(
                eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                eq(dictionaryIdempotencyKeysTable.operation, 'bulk_commit'),
                eq(
                    dictionaryIdempotencyKeysTable.idempotencyKey,
                    input.idempotencyKey,
                ),
                lte(
                    dictionaryIdempotencyKeysTable.expiresAt,
                    input.context.now,
                ),
            ),
        );

    await tx.execute(sql`
            delete from ${dictionaryIdempotencyKeysTable}
            where ${dictionaryIdempotencyKeysTable.id} in (
                select ${dictionaryIdempotencyKeysTable.id}
                from ${dictionaryIdempotencyKeysTable}
                where ${dictionaryIdempotencyKeysTable.expiresAt} <= ${input.context.now.toISOString()}::timestamptz
                order by ${dictionaryIdempotencyKeysTable.expiresAt}
                limit 100
                for update skip locked
            )
        `);

    const [inserted] = await tx
        .insert(dictionaryIdempotencyKeysTable)
        .values({
            createdAt: input.context.now,
            expiresAt: new Date(
                input.context.now.getTime() + idempotencyLifetimeMs,
            ),
            id: context.ids.generate(),
            idempotencyKey: input.idempotencyKey,
            operation: 'bulk_commit',
            ownerId: input.ownerId,
            requestFingerprint: input.fingerprint,
            updatedAt: input.context.now,
        })
        .onConflictDoNothing({
            target: [
                dictionaryIdempotencyKeysTable.ownerId,
                dictionaryIdempotencyKeysTable.operation,
                dictionaryIdempotencyKeysTable.idempotencyKey,
            ],
        })
        .returning({ id: dictionaryIdempotencyKeysTable.id });

    if (inserted) return null;
    const [existing] = await tx
        .select()
        .from(dictionaryIdempotencyKeysTable)
        .where(
            and(
                eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                eq(dictionaryIdempotencyKeysTable.operation, 'bulk_commit'),
                eq(
                    dictionaryIdempotencyKeysTable.idempotencyKey,
                    input.idempotencyKey,
                ),
            ),
        )
        .limit(1)
        .for('update');

    if (
        !existing ||
        existing.requestFingerprint !== input.fingerprint ||
        existing.state !== 'completed' ||
        !existing.resultPayload
    )
        throw new DictionaryIdempotencyConflictError();
    const parsed = DictionaryDeterministicImportResponseSchema.safeParse(
        existing.resultPayload,
    );

    if (!parsed.success) throw new DictionaryIdempotencyConflictError();

    return parsed.data;
}

export async function completeBulkIdempotency(
    tx: DictionaryTransaction,
    input: Pick<
        Parameters<DictionaryStore['importDictionary']>[0],
        'context' | 'idempotencyKey' | 'ownerId'
    >,
    result: DictionaryDeterministicImportResponse,
): Promise<void> {
    const updated = await tx
        .update(dictionaryIdempotencyKeysTable)
        .set({
            completedAt: input.context.now,
            resultDictionaryId: result.dictionary.id,
            resultPayload: result,
            state: 'completed',
            updatedAt: input.context.now,
        })
        .where(
            and(
                eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                eq(dictionaryIdempotencyKeysTable.operation, 'bulk_commit'),
                eq(
                    dictionaryIdempotencyKeysTable.idempotencyKey,
                    input.idempotencyKey,
                ),
                eq(dictionaryIdempotencyKeysTable.state, 'in_progress'),
            ),
        )
        .returning({ id: dictionaryIdempotencyKeysTable.id });

    if (updated.length !== 1) throw new DictionaryIdempotencyConflictError();
}
