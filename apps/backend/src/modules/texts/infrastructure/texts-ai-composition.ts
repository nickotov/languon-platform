import type { TextAiAdmissionParticipant } from '../../text-ai/application/text-ai-admission-participant';
import type { TextAiProviderBudgetPolicy } from '../../text-ai/application/text-ai-provider-catalog';
import type { TextsAiProvider } from '../application/ports/texts-ai-provider';
import type { GenerationBurstLimiter } from '../../text-ai/application/generation-burst-limiter';
import { TextsJobService } from '../application/texts-job-service';
import {
    TextsWorkerService,
    type TextsWorkerDependencies,
} from '../application/texts-worker-service';
import { DrizzleTextsJobStore } from './persistence/drizzle/drizzle-texts-job-store';
import type {
    TextsDatabase,
    TextsTransaction,
} from './persistence/drizzle/texts-job-support';
export function createTextsAiComposition(input: {
    database: TextsDatabase;
    enabled: boolean;
    burstLimiter: GenerationBurstLimiter;
    fingerprintSecret: string;
    authenticate: (token: string) => Promise<{ userId: string }>;
    clock?: { now(): Date };
    admissionParticipant: (tx: TextsTransaction) => TextAiAdmissionParticipant;
    budget: TextAiProviderBudgetPolicy;
    globalQueueLimit?: number;
    userQueueLimit?: number;
    maxAttempts?: number;
}) {
    const clock = input.clock ?? { now: () => new Date() };
    const store = new DrizzleTextsJobStore(input.database, {
        fingerprintSecret: input.fingerprintSecret,
        resolveExecution: (tx, userId, format, now) =>
            input.admissionParticipant(tx).resolve({
                userId,
                format,
                now,
                legacyBudget: input.budget,
                requiredWorkerFormat: format,
            }),
        ...(input.globalQueueLimit === undefined
            ? {}
            : { globalQueueLimit: input.globalQueueLimit }),
        ...(input.userQueueLimit === undefined
            ? {}
            : { userQueueLimit: input.userQueueLimit }),
        ...(input.maxAttempts === undefined
            ? {}
            : { maxAttempts: input.maxAttempts }),
    });
    return {
        store,
        service: new TextsJobService({
            store,
            clock,
            enabled: input.enabled,
            burstLimiter: input.burstLimiter,
            authenticate: input.authenticate,
        }),
    };
}
export function createTextsWorkerComposition(
    input: Omit<TextsWorkerDependencies, 'store' | 'provider'> & {
        database: TextsDatabase;
        provider: TextsAiProvider;
    },
) {
    const store = new DrizzleTextsJobStore(input.database);
    const worker = new TextsWorkerService({ ...input, store });
    return { store, worker };
}
