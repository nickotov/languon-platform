import type {
    AiCreditGrantSource,
    AiCreditMeasurement,
    AiCreditPolicyMode,
} from '../domain/ai-credit';

export interface AiCreditPolicySnapshot {
    mode: AiCreditPolicyMode;
    unlimitedUntil: Date | null;
}

export interface AiCreditReservationResult {
    policy: AiCreditPolicySnapshot;
    reservationId: string;
    reservedCredits: bigint;
}

export interface AiCreditSettlementResult {
    chargedCredits: bigint;
    measuredCredits: bigint | null;
    measurement: AiCreditMeasurement;
    releasedCredits: bigint;
}

export interface AiCreditAccountSummary {
    availableCredits: bigint;
    consumedCredits: bigint;
    managementVersion: number;
    nextExpirationAt: Date | null;
    policy: {
        configuredMode: AiCreditPolicyMode;
        effectiveMode: AiCreditPolicyMode;
        unlimitedUntil: Date | null;
    };
    reservedCredits: bigint;
}

export interface AiCreditHistoryEntry {
    amount: bigint;
    createdAt: Date;
    expiresAt: Date | null;
    grantSource: AiCreditGrantSource | null;
    id: string;
    kind:
        | 'grant'
        | 'admin_removal'
        | 'reservation'
        | 'settlement'
        | 'release'
        | 'policy_update';
    measurement: AiCreditMeasurement | null;
    reason: string | null;
}

export interface AiCreditTransactionParticipant {
    accountSummary(ownerId: string, at: Date): Promise<AiCreditAccountSummary>;
    history(input: {
        ownerId: string;
        page: number;
        pageSize: number;
    }): Promise<{ entries: AiCreditHistoryEntry[]; total: number }>;
    issueGrant(input: {
        amount: bigint;
        createdAt: Date;
        expiresAt: Date | null;
        ownerId: string;
        source: AiCreditGrantSource;
        sourceReference: string;
    }): Promise<{ created: boolean; grantId: string }>;
    adjustByAdmin(input: {
        amount: bigint;
        at: Date;
        expectedManagementVersion: number;
        expiresAt: Date | null;
        ownerId: string;
        reason: string;
        sourceReference: string;
    }): Promise<AiCreditAccountSummary>;
    updatePolicy(input: {
        at: Date;
        expectedManagementVersion: number;
        mode: AiCreditPolicyMode;
        ownerId: string;
        reason: string;
        unlimitedUntil: Date | null;
    }): Promise<AiCreditAccountSummary>;
    reserveAttempt(input: {
        at: Date;
        attempt: number;
        jobId: string;
        maximumCredits: bigint;
        ownerId: string;
        reservationId: string;
    }): Promise<AiCreditReservationResult>;
    markProviderDispatched(input: {
        dispatchedAt: Date;
        ownerId: string;
        reservationId: string;
    }): Promise<void>;
    settleAttempt(input: {
        measuredCredits: bigint | null;
        measurement: AiCreditMeasurement;
        ownerId: string;
        reservationId: string;
        settledAt: Date;
    }): Promise<AiCreditSettlementResult>;
    releaseUndispatchedAttempt(input: {
        ownerId: string;
        releasedAt: Date;
        reservationId: string;
    }): Promise<void>;
    purgeOwner(ownerId: string): Promise<void>;
}
