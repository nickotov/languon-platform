import { defaultAiGenerationTimeoutMs } from '../../../config/ai-generation-environment';
import {
    SentenceWorkerService,
    type SentenceWorkerServiceDependencies,
} from '../application/sentence-worker-service';

/** Production execution policy shared by the command and its deadline regressions. */
export function createSentenceWorkerRuntime(
    dependencies: Pick<
        SentenceWorkerServiceDependencies,
        | 'store'
        | 'provider'
        | 'clock'
        | 'workerId'
        | 'supportedFormats'
        | 'onInvalidModelOutput'
    > & { timeoutMs?: number },
) {
    return new SentenceWorkerService({
        ...dependencies,
        leaseMs: 30_000,
        heartbeatMs: 10_000,
        // Heartbeats renew the shorter lease while the configured request
        // deadline is still active.
        timeoutMs: dependencies.timeoutMs ?? defaultAiGenerationTimeoutMs,
        globalConcurrency: 10,
        learnerConcurrency: 1,
        maxAttempts: 3,
        retryDelayMs: 5_000,
    });
}
