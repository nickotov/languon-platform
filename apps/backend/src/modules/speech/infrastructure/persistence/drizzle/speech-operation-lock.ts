import { sql } from 'drizzle-orm';
import type { AiCreditTransaction } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';

export async function lockSpeechOperation(
    transaction: AiCreditTransaction,
    key: string,
) {
    await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${key}, 1920424383))`,
    );
}
