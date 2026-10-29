import { randomUUID } from 'node:crypto';
import { KnowledgeBlockFieldService } from '../../src/modules/knowledge/application/block-field-service';
import { KnowledgeExerciseEvaluationService } from '../../src/modules/knowledge/application/exercise-evaluation-service';
import { DrizzleKnowledgeBlockFieldStore } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/block-field-store';
import { DrizzleKnowledgeExerciseEvaluationStore } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/exercise-evaluation-store';
import { createKnowledgeBlockFieldRoutes } from '../../src/modules/knowledge/interface/http/block-field-routes';
import { createKnowledgeExerciseEvaluationRoutes } from '../../src/modules/knowledge/interface/http/exercise-evaluation-routes';
import { setTimeout as delay } from 'node:timers/promises';
import {
    TextLanguageSchema,
    TextSourceSegmentSchema,
} from '@languon/contracts';
import type { KnowledgeDatabase } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import type { RateLimiter } from '../../src/modules/authentication/application/ports/rate-limiter';
import type { AuthHttpPolicy } from '../../src/modules/authentication/interface/http/auth-http-policy';
import { KnowledgePrivateTranslationService } from '../../src/modules/knowledge/application/private-translation-service';
import { DrizzleKnowledgePrivateTranslationStore } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/private-translation-store';
import { KnowledgeShareCrypto } from '../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { createKnowledgePrivateTranslationRoutes } from '../../src/modules/knowledge/interface/http/private-translation-routes';
import { RedisGenerationBurstLimiter } from '../../src/modules/text-ai/infrastructure/generation-burst-limiter';
import {
    createTextsAiComposition,
    createTextsWorkerComposition,
} from '../../src/modules/texts/infrastructure/texts-ai-composition';
import { createTextsAiProvider } from '../../src/modules/texts/infrastructure/ai/texts-ai-provider';
import { createTextAiProviderRuntime } from '../../src/infrastructure/text-ai/provider-runtime';
import { DrizzleTextAiAdmissionParticipant } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import {
    defaultTextAiProviderBudgetPolicy,
    textAiModelCatalog,
} from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import { dictionaryAiWorkerObservationsTable as observations } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textsExecutionObservationId } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import {
    fixtureRouteFingerprint,
    textAiFixtureCredentials,
} from './text-ai-routing-fixture';

/** Only the external HTTP response is synthetic; admission, worker, SDK, source
 * grants, private publication and credit accounting are the production modules. */
export function createKnowledgePrivateTranslationFixture(input: {
    database: KnowledgeDatabase;
    rateLimiter: RateLimiter;
    secret: string;
    authenticate(token: string): Promise<{ userId: string }>;
    policy: AuthHttpPolicy;
    clock: { now(): Date };
}) {
    const controller = new AbortController();
    let loop: Promise<void> | undefined;
    const burstLimiter = new RedisGenerationBurstLimiter(input.rateLimiter);
    const ai = createTextsAiComposition({
        database: input.database,
        enabled: true,
        burstLimiter,
        fingerprintSecret: input.secret,
        authenticate: input.authenticate,
        clock: input.clock,
        budget: defaultTextAiProviderBudgetPolicy,
        admissionParticipant: (tx) =>
            new DrizzleTextAiAdmissionParticipant(tx, {
                routingEnabled: true,
                credentialConfigured: () => true,
                routeFingerprint: fixtureRouteFingerprint,
                pricingAdmissionEnabled: true,
            }),
    });
    const provider = createTextsAiProvider({
        credentials: textAiFixtureCredentials,
        runtime: createTextAiProviderRuntime(
            input.database,
            textAiFixtureCredentials,
        ),
    });
    const http: typeof fetch = async (value, init) => {
        const request = new Request(value, init),
            url = new URL(request.url);
        if (
            url.origin !== 'https://api.deepseek.com' ||
            url.pathname !== '/chat/completions' ||
            request.method !== 'POST'
        )
            throw new Error(
                'Unexpected private translation fixture HTTP target',
            );
        const body = (await request.json()) as {
            model?: unknown;
            messages?: Array<{ role?: unknown; content?: unknown }>;
        };
        let payload: Record<string, unknown> | undefined;
        for (const message of body.messages ?? []) {
            if (message.role !== 'user') continue;
            const parts =
                typeof message.content === 'string'
                    ? [message.content]
                    : Array.isArray(message.content)
                      ? message.content.map((part) => part?.text)
                      : [];
            for (const part of parts) {
                if (typeof part !== 'string') continue;
                try {
                    const parsed: unknown = JSON.parse(part);
                    if (
                        parsed &&
                        typeof parsed === 'object' &&
                        ('segments' in parsed ||
                            'action' in parsed ||
                            'exercise' in parsed)
                    )
                        payload = parsed as Record<string, unknown>;
                } catch {
                    /* Inline schema instructions are not source input. */
                }
            }
        }
        if (!payload)
            throw new Error('Missing bounded knowledge-action fixture input');
        let result: unknown;
        if ('action' in payload) {
            const source = String(payload.sourceText ?? '');
            const target = String(payload.targetLanguage ?? '');
            const translations: Record<string, string> = {
                travail: 'работа',
                joie: 'радость',
                ménage: 'уборка',
                carrelage: 'плитка',
                poisson: 'рыба',
                nourriture: 'корм',
            };
            const expected =
                target === 'ru' && translations[source]
                    ? translations[source]
                    : `[${target}] ${source}`;
            result =
                payload.action === 'check' && payload.currentValue === expected
                    ? {
                          status: 'correct',
                          explanation:
                              'The translation fits this source phrase.',
                      }
                    : {
                          status: 'suggested',
                          proposedValue: expected,
                          explanation:
                              'Use this translation for the selected source phrase.',
                      };
        } else if ('exercise' in payload) {
            const exercise = payload.exercise as { referenceAnswer?: string };
            const learnerAnswer = payload.learnerAnswer;
            let answer =
                typeof learnerAnswer === 'string'
                    ? learnerAnswer
                    : JSON.stringify(learnerAnswer);
            if (
                learnerAnswer &&
                typeof learnerAnswer === 'object' &&
                'text' in learnerAnswer
            )
                answer = String(learnerAnswer.text);
            const alternative = answer === 'Bonjour.';
            const correct =
                alternative ||
                answer?.toLowerCase().replace(/[.!]/gu, '').trim() ===
                    exercise.referenceAnswer
                        ?.toLowerCase()
                        .replace(/[.!]/gu, '')
                        .trim();
            result = {
                status: correct ? 'correct' : 'incorrect',
                feedback: alternative
                    ? 'A valid alternative expresses the reference meaning.'
                    : correct
                      ? 'Your answer expresses the reference meaning.'
                      : 'Review the source passage and try again.',
                validAlternative: alternative,
            };
        } else {
            if (
                !Array.isArray(payload.segments) ||
                payload.segments.length > 500
            )
                throw new Error(
                    'Missing bounded private translation fixture input',
                );
            const language = TextLanguageSchema.parse(payload.targetLanguage);
            const translation = payload.segments.map((value) => {
                const segment = TextSourceSegmentSchema.parse(value);
                return {
                    pairId: segment.pairId,
                    text: segment.text.startsWith('\n\n')
                        ? `\n\n[${language}] ${segment.text.slice(2)}`
                        : `[${language}] ${segment.text}`,
                };
            });
            result = { translation };
        }
        await delay(200, undefined, { signal: request.signal });
        return Response.json({
            id: `synthetic-private-${randomUUID()}`,
            object: 'chat.completion',
            created: 1,
            model: body.model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: JSON.stringify(result),
                    },
                    finish_reason: 'stop',
                },
            ],
            usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                total_tokens: 120,
            },
        });
    };
    const execution = createTextsWorkerComposition({
        database: input.database,
        clock: input.clock,
        workerId: 'interactive-translation-journey',
        leaseMs: 30_000,
        heartbeatMs: 10_000,
        timeoutMs: 20_000,
        globalConcurrency: 1,
        userConcurrency: 1,
        maxAttempts: 2,
        retryDelayMs: 100,
        supportedFormats: ['text-translation:v3', 'text-translation:v4'],
        provider: {
            async run(call) {
                const previous = globalThis.fetch;
                globalThis.fetch = http;
                try {
                    return await provider.run(call);
                } finally {
                    globalThis.fetch = previous;
                }
            },
        },
    });
    return {
        fieldRoutes: createKnowledgeBlockFieldRoutes({
            policy: input.policy,
            service: new KnowledgeBlockFieldService({
                store: new DrizzleKnowledgeBlockFieldStore(
                    ai.store.knowledgeActionPersistence(),
                ),
                authenticate: input.authenticate,
                rateLimiter: input.rateLimiter,
                burstLimiter,
            }),
        }),
        evaluationRoutes: createKnowledgeExerciseEvaluationRoutes({
            policy: input.policy,
            service: new KnowledgeExerciseEvaluationService({
                store: new DrizzleKnowledgeExerciseEvaluationStore(
                    ai.store.knowledgeActionPersistence(),
                    new KnowledgeShareCrypto(input.secret),
                ),
                authenticate: input.authenticate,
                rateLimiter: input.rateLimiter,
                burstLimiter,
            }),
        }),
        routes: createKnowledgePrivateTranslationRoutes({
            policy: input.policy,
            service: new KnowledgePrivateTranslationService({
                store: new DrizzleKnowledgePrivateTranslationStore({
                    database: input.database,
                    crypto: new KnowledgeShareCrypto(input.secret),
                    jobs: ai.store,
                    enabled: true,
                    now: () => input.clock.now(),
                }),
                authenticate: input.authenticate,
                rateLimiter: input.rateLimiter,
                burstLimiter,
            }),
        }),
        async start() {
            const model = textAiModelCatalog.find(
                    (item) => item.id === 'deepseek-flash',
                )!,
                now = input.clock.now();
            await input.database
                .insert(observations)
                .values({
                    id: textsExecutionObservationId(
                        'interactive-translation-journey',
                        model.providerId,
                        model.id,
                    ),
                    workerId: 'interactive-translation-journey',
                    providerId: model.providerId,
                    modelId: model.id,
                    adapterRevision: model.adapterRevision,
                    status: 'available',
                    message: 'Synthetic HTTP private translation fixture',
                    checkedAt: now,
                    expiresAt: new Date(now.getTime() + 3_600_000),
                    textAiSelectionRevision: 1,
                    textAiCapacityRevision: 1,
                    textsExecutionRevision: 1,
                    textsCapacityRevision: 1,
                    creditSettlementRevision: 1,
                    textAiSupportedFormats: [
                        'text-translation:v3',
                        'text-translation:v4',
                    ],
                })
                .onConflictDoUpdate({
                    target: observations.id,
                    set: {
                        checkedAt: now,
                        expiresAt: new Date(now.getTime() + 3_600_000),
                    },
                });
            loop = (async () => {
                while (!controller.signal.aborted) {
                    await execution.worker.processNext(controller.signal);
                    await delay(50, undefined, { signal: controller.signal });
                }
            })().catch((error) => {
                if (!controller.signal.aborted)
                    console.error(
                        'Private translation fixture worker failed.',
                        error instanceof Error ? error.name : 'Unknown',
                    );
            });
        },
        async close() {
            controller.abort();
            await loop;
        },
    };
}
