import type { TextAiProviderLeaseContext } from '../../application/ports/text-ai-provider-lease-context';
import { legacyProviderAttemptId } from '../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { withTextAiProviderAttemptWitness } from './text-ai-provider-attempt-context';

export function withQueuedTextAiProviderAttempt<T>(
    context: TextAiProviderLeaseContext | undefined,
    routed: boolean,
    operation: () => T,
): T {
    if (!context || !routed) return operation();
    return withTextAiProviderAttemptWitness(
        {
            attemptId: legacyProviderAttemptId(context.jobId, context.attempt),
            jobId: context.jobId,
            workerId: context.workerId,
            fencingToken: context.fencingToken,
        },
        operation,
    );
}
