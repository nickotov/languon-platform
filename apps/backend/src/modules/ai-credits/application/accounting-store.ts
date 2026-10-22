import type {
    AccountingRecord,
    AccountingRecordRequest,
    AccountingReport,
    AccountingRefundContext,
} from '@languon/contracts';
import type { AiCreditTransactionParticipant } from './ai-credit-participant';

export interface PurchaseCreditRevocation {
    revokePurchaseGrantAvailable(input: {
        ownerId: string;
        grantId: string;
        amount: bigint;
        sourceReference: string;
        reason: string;
        at: Date;
    }): Promise<unknown>;
}
export interface AccountingStore {
    record(
        input: AccountingRecordRequest,
        actorId: string,
        at: Date,
    ): Promise<AccountingRecord>;
    refundContext(paymentId: string): Promise<AccountingRefundContext>;
    list(input: { before?: Date; limit: number }): Promise<AccountingRecord[]>;
    report(from: Date, to: Date): Promise<AccountingReport>;
}
export type AccountingCredits = AiCreditTransactionParticipant &
    PurchaseCreditRevocation;
export interface ProviderExpenseFact {
    attemptId?: string | null;
    attemptReference: string;
    actionId: string;
    providerId: string;
    modelId: string;
    measurement: 'measured' | 'estimated' | 'unknown';
    costSource: 'calculated' | 'provider_reported' | 'unknown';
    amountUsdMicros: bigint | null;
    occurredAt: Date;
}
