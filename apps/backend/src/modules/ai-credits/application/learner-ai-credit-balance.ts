import type { LearnerAiCreditBalance } from '@languon/contracts';
import type { AiCreditAccountSummary } from './ai-credit-participant';
import { formatCreditMilli } from '../domain/exact-credit-amount';

export interface LearnerAiCreditBalanceReader {
    accountSummary(ownerId: string, at: Date): Promise<AiCreditAccountSummary>;
}

export class LearnerAiCreditBalanceService {
    public constructor(private readonly reader: LearnerAiCreditBalanceReader) {}

    public async get(
        ownerId: string,
        at = new Date(),
    ): Promise<LearnerAiCreditBalance> {
        const summary = await this.reader.accountSummary(ownerId, at);
        return summary.policy.effectiveMode === 'unlimited'
            ? { mode: 'unlimited', availableCredits: null }
            : {
                  mode: 'limited',
                  availableCredits: formatCreditMilli(summary.availableCredits),
              };
    }
}
