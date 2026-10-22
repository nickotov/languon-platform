import { ensureActionBudgetDefault } from './action-budget-default';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    type TextAiPreferenceStore,
    type TextAiPreferenceSession,
    TextAiUserUnavailableError,
} from '../../../domain/text-ai-preference-store';
import { textAiPreferencesTable } from './schema';
import {
    defaultTextAiAvailabilityPolicy,
    readTextAiCatalog,
    type TextAiAvailabilityPolicy,
} from './text-ai-catalog-query';

export class DrizzleTextAiPreferenceStore implements TextAiPreferenceStore {
    public constructor(
        private readonly database: PostgresJsDatabase<typeof databaseSchema>,
        private readonly policy: TextAiAvailabilityPolicy = defaultTextAiAvailabilityPolicy(),
    ) {}
    public run<T>(
        userId: string,
        work: (session: TextAiPreferenceSession) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (transaction) => {
            const [user] = await transaction
                .select({ status: usersTable.status })
                .from(usersTable)
                .where(eq(usersTable.id, userId))
                .for('update');
            if (!user || user.status !== 'active')
                throw new TextAiUserUnavailableError();
            return work({
                read: async () => {
                    const preference = await ensureActionBudgetDefault(
                        transaction,
                        userId,
                        new Date(),
                    );
                    return preference
                        ? {
                              mode: preference.mode,
                              modelId: preference.modelId,
                              version: preference.version,
                              maxCreditsPerAction:
                                  preference.maxCreditsPerAction,
                          }
                        : {
                              mode: 'auto',
                              modelId: null,
                              version: 0,
                              maxCreditsPerAction: null,
                          };
                },
                catalog: (at, mode) =>
                    readTextAiCatalog(transaction, at, this.policy, mode),
                save: async (preference, at) => {
                    await transaction
                        .insert(textAiPreferencesTable)
                        .values({
                            ...preference,
                            userId,
                            createdAt: at,
                            updatedAt: at,
                        })
                        .onConflictDoUpdate({
                            target: textAiPreferencesTable.userId,
                            set: { ...preference, updatedAt: at },
                        });
                },
            });
        });
    }
}
