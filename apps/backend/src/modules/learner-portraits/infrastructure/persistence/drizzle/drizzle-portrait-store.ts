import { clearLearnerPortraitInterview } from './portrait-deletion-participant';
import { PortraitStateSchema, type PortraitState } from '@languon/contracts';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    emptyPortraitState,
    PortraitUserUnavailableError,
    type PortraitStore,
    type PortraitStoreSession,
} from '../../../application/ports/portrait-store';
import {
    learnerPortraitsTable,
    learnerPortraitInterviewsTable,
} from './schema';

export type PortraitDatabase = PostgresJsDatabase<typeof databaseSchema>;
export type PortraitTransaction = Parameters<
    Parameters<PortraitDatabase['transaction']>[0]
>[0];

/** All writers lock the same active account before private portrait rows. */
export async function lockPortraitOwner(
    tx: PortraitTransaction,
    userId: string,
): Promise<void> {
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for('update');

    if (owner?.status !== 'active') throw new PortraitUserUnavailableError();
}

export async function readPortraitState(
    tx: PortraitTransaction,
    userId: string,
): Promise<PortraitState> {
    const [row] = await tx
        .select({ state: learnerPortraitsTable.state })
        .from(learnerPortraitsTable)
        .where(eq(learnerPortraitsTable.ownerId, userId));

    return row ? PortraitStateSchema.parse(row.state) : emptyPortraitState();
}

export async function savePortraitState(
    tx: PortraitTransaction,
    userId: string,
    value: PortraitState,
    at: Date,
): Promise<void> {
    const state = PortraitStateSchema.parse(value);
    const record = {
        ownerId: userId,
        state,
        version: state.version,
        generation: state.generation,
        draftExpiresAt: state.draft ? new Date(state.draft.expiresAt) : null,
        updatedAt: at,
    };

    await tx.insert(learnerPortraitsTable).values(record).onConflictDoUpdate({
        target: learnerPortraitsTable.ownerId,
        set: record,
    });
}

export class DrizzlePortraitStore implements PortraitStore {
    constructor(private readonly database: PortraitDatabase) {}
    run<T>(
        userId: string,
        work: (session: PortraitStoreSession) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (tx) => {
            await lockPortraitOwner(tx, userId);

            return work({
                read: () => readPortraitState(tx, userId),
                save: (state, at) => savePortraitState(tx, userId, state, at),
                clearInterview: () => clearPortraitInterview(tx, userId),
                touchInterview: async (at) => {
                    await tx
                        .update(learnerPortraitInterviewsTable)
                        .set({
                            updatedAt: at,
                            expiresAt: new Date(at.getTime() + 14 * 86400_000),
                        })
                        .where(
                            eq(learnerPortraitInterviewsTable.ownerId, userId),
                        );
                },
            });
        });
    }
}

/** Hook is extended by the operation adapter; no external work in this transaction. */
export async function clearPortraitInterview(
    tx: PortraitTransaction,
    userId: string,
): Promise<void> {
    await clearLearnerPortraitInterview(tx, userId);
}

export async function readApprovedPortraitForConversation(
    tx: PortraitTransaction,
    ownerId: string,
): Promise<{ enabled: boolean; portrait: PortraitState['approved'] }> {
    const state = await readPortraitState(tx, ownerId);

    return {
        enabled: state.useEnabled && Boolean(state.approved),
        portrait: state.approved,
    };
}
