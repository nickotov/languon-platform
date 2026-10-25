import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import { LearnerAiCreditBalanceService } from '../application/learner-ai-credit-balance';
import { readSummary } from './persistence/drizzle/ai-credit-wallet-access';
import {
    createLearnerAiCreditBalanceRoutes,
    type LearnerAiCreditBalanceRouteDependencies,
} from '../interface/http/learner-ai-credit-balance.routes';

export function createLearnerAiCreditBalanceModule(
    input: Omit<LearnerAiCreditBalanceRouteDependencies, 'balances'> & {
        database: PostgresJsDatabase<typeof databaseSchema>;
    },
) {
    const balances = new LearnerAiCreditBalanceService({
        accountSummary: (ownerId, at) =>
            input.database.transaction(
                async (transaction) => {
                    // Reads share one snapshot without joining the wallet writer lock.
                    await transaction.execute(
                        sql`set local statement_timeout = '2s'`,
                    );
                    await transaction.execute(
                        sql`set local lock_timeout = '250ms'`,
                    );
                    return readSummary({ transaction }, ownerId, at);
                },
                { isolationLevel: 'repeatable read', accessMode: 'read only' },
            ),
    });
    return {
        balances,
        routes: createLearnerAiCreditBalanceRoutes({ ...input, balances }),
    };
}
