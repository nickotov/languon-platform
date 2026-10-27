import { eq, sql } from 'drizzle-orm';
import { AiActionCreditBudgetSchema } from '@languon/contracts';
import type { AiCreditTransaction } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { textAiPreferencesTable as preferences } from './schema';
import { TextAiPreferenceConflictError } from '../../../domain/text-ai-preference-store';

/** Updates only the learner's maximum; preserves model-selection and other preference fields. */
export async function readUserActionBudget(
    tx: Pick<AiCreditTransaction, 'select'>,
    userId: string,
) {
    const [row] = await tx
        .select({
            version: preferences.version,
            maxCreditsPerAction: preferences.maxCreditsPerAction,
        })
        .from(preferences)
        .where(eq(preferences.userId, userId));

    return row ?? { version: 0, maxCreditsPerAction: null };
}

export async function updateUserActionBudget(
    tx: AiCreditTransaction,
    input: {
        userId: string;
        expectedVersion: number;
        maxCreditsPerAction: string;
    },
    at: Date,
) {
    const amount = AiActionCreditBudgetSchema.parse(input.maxCreditsPerAction);
    await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`user-ai-budget:${input.userId}`},0))`,
    );

    const [existing] = await tx
        .select()
        .from(preferences)
        .where(eq(preferences.userId, input.userId))
        .for('update');

    if ((existing?.version ?? 0) !== input.expectedVersion)
        throw new TextAiPreferenceConflictError(
            'Learner action budget version changed.',
        );
    if (existing) {
        await tx
            .update(preferences)
            .set({
                maxCreditsPerAction: amount,
                version: existing.version + 1,
                updatedAt: at,
            })
            .where(eq(preferences.userId, input.userId));
    } else {
        await tx.insert(preferences).values({
            userId: input.userId,
            mode: 'auto',
            modelId: null,
            maxCreditsPerAction: amount,
            version: 1,
            createdAt: at,
            updatedAt: at,
        });
    }

    return readUserActionBudget(tx, input.userId);
}
