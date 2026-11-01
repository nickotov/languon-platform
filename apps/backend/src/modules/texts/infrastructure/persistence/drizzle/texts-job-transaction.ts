import { sql } from 'drizzle-orm';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { TextsJobStoreContext } from './texts-job-persistence-support';
import type { TextsTransaction } from './texts-job-support';

export function transaction<T>(
    persistence: TextsJobStoreContext,
    work: (tx: TextsTransaction) => Promise<T>,
) {
    return modelPricingTransaction(persistence.database, async (tx) => {
        await lockTextAiCapacity(tx);
        await tx.execute(
            sql`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
        );

        return work(tx);
    });
}
