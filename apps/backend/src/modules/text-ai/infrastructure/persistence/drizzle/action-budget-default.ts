import { eq, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { DrizzleCapabilityPolicyParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { textAiPreferencesTable as preferences } from './schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Preference = typeof preferences.$inferSelect;

/** Copies once, atomically. Explicit learner preferences always win conflicts. */
export async function ensureActionBudgetDefault(
    tx: Transaction,
    userId: string,
    at: Date,
    known?: Preference,
): Promise<Preference | undefined> {
    let current = known;
    if (!current)
        [current] = await tx
            .select()
            .from(preferences)
            .where(eq(preferences.userId, userId));
    if (current?.maxCreditsPerAction != null) return current;
    const settings = await new DrizzleCapabilityPolicyParticipant(
        tx,
    ).settings();

    if (settings.defaultMaxCreditsPerAction === null) return current;
    const [copied] = await tx
        .insert(preferences)
        .values({
            userId,
            mode: current?.mode ?? 'auto',
            modelId: current?.modelId ?? null,
            version: (current?.version ?? 0) + 1,
            maxCreditsPerAction: settings.defaultMaxCreditsPerAction,
            createdAt: current?.createdAt ?? at,
            updatedAt: at,
        })
        .onConflictDoUpdate({
            target: preferences.userId,
            set: {
                maxCreditsPerAction: settings.defaultMaxCreditsPerAction,
                version: sql`${preferences.version} + 1`,
                updatedAt: at,
            },
            setWhere: isNull(preferences.maxCreditsPerAction),
        })
        .returning();

    if (copied) return copied;
    // A simultaneous learner save (or another first admission) supplied it.
    const [latest] = await tx
        .select()
        .from(preferences)
        .where(eq(preferences.userId, userId));

    return latest;
}
