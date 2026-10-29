import { defaultTextAiProviderBudgetPolicy } from '../../text-ai/application/text-ai-provider-catalog';
import { DrizzleTextAiAdmissionParticipant } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import type { TextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import type { AuthHttpPolicy } from '../../authentication/interface/http/auth-http-policy';
import type { KnowledgeDatabase } from './persistence/drizzle/knowledge-transaction';
import { KnowledgeShareCrypto } from './knowledge-share-crypto';
import { DrizzleKnowledgeSentenceFreeStore } from './persistence/drizzle/knowledge-sentence-free-store';
import { DrizzleKnowledgeSentencePaid } from './persistence/drizzle/knowledge-sentence-paid';
import { KnowledgeSentenceService } from '../application/knowledge-sentence-free-service';
import { createKnowledgeSentenceRoutes } from '../interface/http/knowledge-sentence-free-routes';

export function createKnowledgeSentenceComposition(dependencies: {
    database: KnowledgeDatabase;
    secret: string;
    enabled: boolean;
    generationFormat: 'sentence-generation:v1' | 'sentence-generation:v2';
    authenticate(token: string): Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
    policy: AuthHttpPolicy;
    textAiPolicy?: TextAiAvailabilityPolicy;
}) {
    const crypto = new KnowledgeShareCrypto(dependencies.secret);
    const paid = new DrizzleKnowledgeSentencePaid(
        dependencies.database,
        crypto,
        {
            generationFormat: dependencies.generationFormat,
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
        },
    );
    const store = new DrizzleKnowledgeSentenceFreeStore(
        dependencies.database,
        crypto,
        (tx) => paid.admission(tx),
    );
    const service = new KnowledgeSentenceService({
        ...dependencies,
        store,
        paid,
    });
    return {
        service,
        store,
        paid,
        routes: createKnowledgeSentenceRoutes({
            service,
            policy: dependencies.policy,
        }),
    };
}
