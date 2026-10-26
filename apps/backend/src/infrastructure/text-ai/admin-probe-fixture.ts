import type { TextAiProbeExecutor } from '../../modules/text-ai/application/ports/text-ai-probe-store';

/** Browser-journey fixture only. Production SDK execution has separate fake-HTTP contracts. */
export function createSyntheticAdminProbeExecutor(
    executor: TextAiProbeExecutor,
): TextAiProbeExecutor {
    return {
        identity: (request) => executor.identity(request),
        async execute(reservation, signal) {
            signal.throwIfAborted();
            if (!reservation.identity.fingerprint)
                throw new Error('Missing synthetic route identity.');
            return {
                valid: true,
                failure: null,
                elapsedMs: 1,
                inputTokens: 32,
                outputTokens: 8,
                measurement: 'measured',
            };
        },
    };
}
