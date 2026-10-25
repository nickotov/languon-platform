import { DrizzleSentenceLibraryStore } from './persistence/drizzle/drizzle-sentence-library-store';
import { DrizzleSentencePreparationStore } from './persistence/drizzle/drizzle-sentence-preparation-store';
import type { LearningCompositionDependencies } from './learning-composition';
import { HmacDictionaryCryptography } from '../../dictionaries/infrastructure/crypto/dictionary-cryptography';
import { DrizzleDictionaryStore } from '../../dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { SentencePracticeService } from '../application/sentence-practice-service';
import { SentenceWorkerService } from '../application/sentence-worker-service';
import { createSentenceWorkerRuntime } from './sentence-worker-runtime';
import { DrizzleSentencePracticeStore } from './persistence/drizzle/drizzle-sentence-practice-store';
import { DrizzleSentenceWorkerStore } from './persistence/drizzle/drizzle-sentence-worker-store';
import { createSentenceRoutes } from '../interface/http/sentence.routes';
import { DrizzleTextAiAdmissionParticipant } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { defaultTextAiProviderBudgetPolicy } from '../../text-ai/application/text-ai-provider-catalog';
import type { TextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import type { SentenceAiProvider } from '../application/ports/sentence-ai-provider';
import type { SentenceWorkerServiceDependencies } from '../application/sentence-worker-service';

export interface SentenceCompositionDependencies extends LearningCompositionDependencies {
    textAiPolicy?: TextAiAvailabilityPolicy;
    admission?: {
        generationFormat?: 'sentence-generation:v1' | 'sentence-generation:v2';
        defaultMaxAttempts?: number;
        globalQueueLimit?: number;
        userQueueLimit?: number;
        globalConcurrency?: number;
        userConcurrency?: number;
    };
}
/** Production HTTP composition. No provider or wallet is consulted for free reference reads. */
export function createSentenceComposition(
    dependencies: SentenceCompositionDependencies,
) {
    const cryptography = new HmacDictionaryCryptography({
        entropy: dependencies.entropy,
        secret: dependencies.dictionaryHmacSecret,
    });
    const library = new DrizzleSentenceLibraryStore(dependencies.database);
    const { store, preparation } =
        createSentencePreparationWorkerComposition(dependencies);
    const service = new SentencePracticeService({
        clock: dependencies.clock,
        enabled: dependencies.enabled,
        cryptography,
        rateLimiter: dependencies.rateLimiter,
        store,
        library,
        preparation,
        dictionaries: new DrizzleDictionaryStore(
            dependencies.database,
            dependencies.ids,
        ),
        authentication: {
            async authenticate(accessToken) {
                const claims =
                    await dependencies.accessTokens.verify(accessToken);
                await dependencies.authentication.requireActiveSession({
                    sessionId: claims.sessionId,
                    userId: claims.userId,
                });
                return { sessionId: claims.sessionId, userId: claims.userId };
            },
        },
    });
    return {
        service,
        store,
        library,
        preparation,
        routes: createSentenceRoutes({ service, policy: dependencies.policy }),
    };
}
/** Shared durable preparation admission for HTTP and the existing bounded worker. */
export function createSentencePreparationWorkerComposition(
    dependencies: Pick<
        SentenceCompositionDependencies,
        'database' | 'textAiPolicy' | 'admission'
    >,
) {
    const store: DrizzleSentencePracticeStore =
        new DrizzleSentencePracticeStore(dependencies.database, {
            ...dependencies.admission,
            resolvePreparedBatch: (tx, access, id, context) =>
                preparation.resolvePreparedBatch(tx, access, id, context),
            resolveExecution: (tx, userId, format, now, requiredWorkerFormat) =>
                new DrizzleTextAiAdmissionParticipant(
                    tx,
                    dependencies.textAiPolicy,
                ).resolve({
                    userId,
                    format,
                    now,
                    legacyBudget: defaultTextAiProviderBudgetPolicy,
                    ...(requiredWorkerFormat ? { requiredWorkerFormat } : {}),
                }),
        });
    const preparation: DrizzleSentencePreparationStore =
        new DrizzleSentencePreparationStore(dependencies.database, {
            authorizeAction: store.preparePreparationAction.bind(store),
            admitGeneration: (tx, access, input, context) =>
                store.admitPreparationGeneration(tx, access, input, context),
        });
    return { store, preparation };
}
/** Worker/test seam accepts the same provider port; fixtures count calls without route/store mocks. */
export function createSentenceWorkerComposition(
    dependencies: Omit<SentenceWorkerServiceDependencies, 'store'> & {
        database: LearningCompositionDependencies['database'];
        provider: SentenceAiProvider;
    },
) {
    const store = new DrizzleSentenceWorkerStore(dependencies.database);
    const worker = new SentenceWorkerService({ ...dependencies, store });
    return { worker, store };
}

/** Production defaults are exercised directly by the worker runtime regressions. */
export function createSentenceWorkerRuntimeComposition(
    dependencies: Pick<
        SentenceWorkerServiceDependencies,
        | 'provider'
        | 'clock'
        | 'workerId'
        | 'supportedFormats'
        | 'onInvalidModelOutput'
    > & {
        database: LearningCompositionDependencies['database'];
        timeoutMs?: number;
    },
) {
    const store = new DrizzleSentenceWorkerStore(dependencies.database);
    const worker = createSentenceWorkerRuntime({ ...dependencies, store });
    return { worker, store };
}
