import type {
    AiCreditHistoryEntry,
    AiCreditJobKind,
    AiCreditSettlementResult,
    SpeechCreditTransactionParticipant,
} from '../../../application/ai-credit-participant';
import {
    type AiCreditMeasurement,
    type AiCreditPolicyMode,
} from '../../../domain/ai-credit';
import {
    adjustByAdmin,
    issueGrant,
    purgeOwner,
    revokePurchaseGrantAvailable,
    updatePolicy,
} from './ai-credit-grant-operations';
import { type AiCreditTransaction } from './ai-credit-persistence-support';
import {
    markProviderDispatched,
    releaseUndispatchedAttempt,
    reserveAttempt,
    settleAttempt,
    settleFailedAttempt,
    settleSpeechAttempt,
} from './ai-credit-reservation-operations';
import { accountSummary, history } from './ai-credit-wallet-access';
export class DrizzleAiCreditTransactionParticipant implements SpeechCreditTransactionParticipant {
    public constructor(private readonly transaction: AiCreditTransaction) {}

    public async accountSummary(ownerId: string, at: Date) {
        return accountSummary({ transaction: this.transaction }, ownerId, at);
    }

    public async history(input: {
        ownerId: string;
        page: number;
        pageSize: number;
    }): Promise<{ entries: AiCreditHistoryEntry[]; total: number }> {
        return history({ transaction: this.transaction }, input);
    }

    public async issueGrant(input: {
        amount: bigint;
        createdAt: Date;
        expiresAt: Date | null;
        ownerId: string;
        source: 'admin' | 'subscription' | 'purchase' | 'migration';
        sourceReference: string;
    }) {
        return issueGrant({ transaction: this.transaction }, input);
    }

    public async revokePurchaseGrantAvailable(input: {
        ownerId: string;
        grantId: string;
        amount: bigint;
        sourceReference: string;
        reason: string;
        at: Date;
    }): Promise<{ created: boolean; revokedCredits: bigint }> {
        return revokePurchaseGrantAvailable(
            { transaction: this.transaction },
            input,
        );
    }

    public async adjustByAdmin(input: {
        amount: bigint;
        at: Date;
        expectedManagementVersion: number;
        expiresAt: Date | null;
        ownerId: string;
        reason: string;
        sourceReference: string;
    }) {
        return adjustByAdmin({ transaction: this.transaction }, input);
    }

    public async updatePolicy(input: {
        at: Date;
        expectedManagementVersion: number;
        mode: AiCreditPolicyMode;
        ownerId: string;
        reason: string;
        unlimitedUntil: Date | null;
    }) {
        return updatePolicy({ transaction: this.transaction }, input);
    }

    public async reserveAttempt(input: {
        at: Date;
        attempt: number;
        jobId: string;
        jobKind?: AiCreditJobKind;
        interviewCreditsBypass?: boolean;
        maximumCredits: bigint;
        ownerId: string;
        reservationId: string;
    }) {
        return reserveAttempt({ transaction: this.transaction }, input);
    }

    public async markProviderDispatched(input: {
        dispatchedAt: Date;
        ownerId: string;
        reservationId: string;
    }) {
        return markProviderDispatched({ transaction: this.transaction }, input);
    }

    public async settleAttempt(input: {
        measuredCredits: bigint | null;
        measurement: AiCreditMeasurement;
        ownerId: string;
        reservationId: string;
        settledAt: Date;
    }): Promise<AiCreditSettlementResult> {
        return settleAttempt({ transaction: this.transaction }, input);
    }

    public async settleFailedAttempt(input: {
        ownerId: string;
        reservationId: string;
        settledAt: Date;
    }): Promise<AiCreditSettlementResult> {
        return settleFailedAttempt({ transaction: this.transaction }, input);
    }

    public async settleSpeechAttempt(input: {
        ownerId: string;
        reservationId: string;
        settledAt: Date;
        billingDeadline?: Date;
        outcome: 'success' | 'failure' | 'deadline';
    }): Promise<AiCreditSettlementResult> {
        return settleSpeechAttempt({ transaction: this.transaction }, input);
    }

    public async releaseUndispatchedAttempt(input: {
        ownerId: string;
        releasedAt: Date;
        reservationId: string;
    }) {
        return releaseUndispatchedAttempt(
            { transaction: this.transaction },
            input,
        );
    }

    public async purgeOwner(
        ownerId: string,
        authorization?: { workerId: string; fencingToken: number },
    ) {
        return purgeOwner(
            { transaction: this.transaction },
            ownerId,
            authorization,
        );
    }
}
export { aiCreditOwnerLockNamespace } from './ai-credit-persistence-support';
export type { AiCreditTransaction } from './ai-credit-persistence-support';
