import type {
    ProviderPrice,
    TextAiProbe,
    TextAiProbeFailure,
    TextAiProbeRequest,
    ProviderNativeUsage,
    ProviderExecutionFacts,
} from '@languon/contracts';

export interface TextAiProbeLimits {
    maximumCostMicros: bigint;
    dailyMaximumCostMicros: bigint;
    cooldownSeconds: number;
    evidenceHours: number;
}
export interface TextAiProbeIdentity {
    routeId: string;
    providerId: string;
    modelId: string;
    fingerprint: string;
}
export interface TextAiProbeReservation {
    id: string;
    identity: TextAiProbeIdentity;
    request: TextAiProbeRequest;
    price: ProviderPrice;
    maximumCostMicros: bigint;
    startedAt: Date;
}
export interface TextAiProbeResult {
    nativeUsage?: ProviderNativeUsage;
    executionFacts?: ProviderExecutionFacts;
    valid: boolean;
    failure: TextAiProbeFailure | null;
    elapsedMs: number;
    firstOutputMs?: number;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    measurement: 'measured' | 'estimated' | 'unknown';
}
export interface TextAiProbeStore {
    reserve(input: {
        actorId: string;
        identity: TextAiProbeIdentity;
        request: TextAiProbeRequest;
        at: Date;
        limits: TextAiProbeLimits;
    }): Promise<TextAiProbeReservation>;
    finish(
        reservation: TextAiProbeReservation,
        result: TextAiProbeResult,
        at: Date,
    ): Promise<TextAiProbe>;
    list(at: Date, limits: TextAiProbeLimits): Promise<TextAiProbe[]>;
    recover(input: {
        probeId: string;
        actorId: string;
        reason: string;
        at: Date;
    }): Promise<TextAiProbe>;
}
export interface TextAiProbeExecutor {
    identity(
        request: Omit<TextAiProbeRequest, 'approvedMaximumCostUsd'> & {
            approvedMaximumCostUsd?: string;
        },
    ): TextAiProbeIdentity;
    execute(
        reservation: TextAiProbeReservation,
        signal: AbortSignal,
    ): Promise<TextAiProbeResult>;
}
export class TextAiProbeUnavailableError extends Error {
    constructor(
        public readonly code:
            | 'probe_limit_reached'
            | 'probe_budget_insufficient'
            | 'probe_limit_changed'
            | 'probe_recovery_required'
            | 'probe_busy'
            | 'probe_cooldown'
            | 'probe_prices_missing'
            | 'probe_route_unavailable'
            | 'probe_check_required',
    ) {
        super(code);
    }
}
