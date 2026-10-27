import { parseFixed } from '../../ai-credits/domain/accounting';
import { TextAiProbeUnavailableError } from './ports/text-ai-probe-store';
import type { TextAiProbeRequest } from '@languon/contracts';
import type {
    TextAiProbeExecutor,
    TextAiProbeLimits,
    TextAiProbeStore,
} from './ports/text-ai-probe-store';

/** Synthetic operator work; deliberately never touches a learner wallet. */
export class TextAiProbeService {
    constructor(
        private readonly store: TextAiProbeStore,
        private readonly executor: TextAiProbeExecutor,
        readonly limits: TextAiProbeLimits,
        private readonly now: () => Date = () => new Date(),
        private readonly timeoutMs = 30_000,
    ) {}

    async run(
        actorId: string,
        request: TextAiProbeRequest,
        externalSignal?: AbortSignal,
        beforeDispatch?: () => Promise<void>,
        maximumCostMicros: bigint = this.limits.maximumCostMicros,
    ) {
        externalSignal?.throwIfAborted();
        if (
            maximumCostMicros <= 0n ||
            maximumCostMicros > this.limits.maximumCostMicros ||
            parseFixed(request.approvedMaximumCostUsd, 6) !== maximumCostMicros
        )
            throw new TextAiProbeUnavailableError('probe_limit_changed');
        const identity = this.executor.identity(request);
        const reservation = await this.store.reserve({
            actorId,
            identity,
            request,
            at: this.now(),
            limits: { ...this.limits, maximumCostMicros },
        });
        const started = performance.now();
        const timeout = AbortSignal.timeout(this.timeoutMs);
        const signal = externalSignal
            ? AbortSignal.any([timeout, externalSignal])
            : timeout;
        let result;
        let dispatchStarted = false;
        try {
            // Revocation can arrive while reserve() is waiting on its database lock.
            signal.throwIfAborted();
            await beforeDispatch?.();
            signal.throwIfAborted();
            dispatchStarted = true;
            result = await this.executor.execute(reservation, signal);
        } catch (error) {
            const notDispatched =
                !dispatchStarted ||
                error instanceof TextAiProbeUnavailableError;
            // No raw provider object crosses this boundary. Unknown usage is never zero.
            result = {
                valid: false,
                failure: notDispatched
                    ? ('budget_insufficient' as const)
                    : signal.aborted
                      ? ('timeout' as const)
                      : ('execution_unknown' as const),
                elapsedMs: Math.ceil(performance.now() - started),
                inputTokens: notDispatched ? 0 : null,
                outputTokens: notDispatched ? 0 : null,
                measurement: notDispatched
                    ? ('measured' as const)
                    : ('unknown' as const),
            };
        }
        return this.store.finish(reservation, result, this.now());
    }

    async recover(
        actorId: string,
        probeId: string,
        request: { reason: string; confirmedUpstreamStopped: true },
    ) {
        return this.store.recover({
            probeId,
            actorId,
            reason: request.reason,
            at: this.now(),
        });
    }

    async list() {
        return {
            probes: await this.store.list(this.now(), this.limits),
            limits: {
                maximumCostUsd: usd(this.limits.maximumCostMicros),
                dailyMaximumCostUsd: usd(this.limits.dailyMaximumCostMicros),
                cooldownSeconds: this.limits.cooldownSeconds,
                evidenceHours: this.limits.evidenceHours,
            },
        };
    }
}
function usd(value: bigint) {
    return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
}
