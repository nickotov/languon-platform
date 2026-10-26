import { createSyntheticAdminProbeExecutor } from './admin-probe-fixture';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../database/schema';
import type { AdministrationService } from '../../modules/administration/application/administration-service';
import type { AuthHttpPolicy } from '../../modules/authentication/interface/http/auth-http-policy';
import type { TextAiProviderCredentials } from '../../modules/text-ai/application/text-ai-provider-catalog';
import type {
    TextAiProbeExecutor,
    TextAiProbeLimits,
} from '../../modules/text-ai/application/ports/text-ai-probe-store';
import { TextAiProbeUnavailableError } from '../../modules/text-ai/application/ports/text-ai-probe-store';
import { TextAiProbeService } from '../../modules/text-ai/application/text-ai-probe-service';
import { createTextAiProbeExecutor } from '../../modules/text-ai/infrastructure/ai/text-ai-probe-executor';
import {
    DrizzleTextAiProbeStore,
    requireProbeReady,
} from '../../modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-probe-store';
import { DrizzleTextAiRoutingStore } from '../../modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';
import { createTextAiRoutingRoutes } from '../../modules/text-ai/interface/http/text-ai-routing.routes';
import { createTextAiSyntheticFlows } from './probe-flow-registry';
import { createTextAiRouteFingerprint } from './route-fingerprint';

/** Production composition. Tests replace only the paid executor at this explicit seam. */
export function createAdminTextAiRoutingComposition(input: {
    database: PostgresJsDatabase<typeof databaseSchema>;
    administration: AdministrationService;
    policy: AuthHttpPolicy;
    credentials: TextAiProviderCredentials;
    limits: TextAiProbeLimits;
    timeoutMs: number;
    executor?: TextAiProbeExecutor;
    syntheticFixture?: boolean;
}) {
    const fingerprint = createTextAiRouteFingerprint(input.credentials);
    const store = new DrizzleTextAiRoutingStore(
        input.database,
        async (tx, request) => {
            const identity = fingerprint(request.routeId, request.flowId);
            if (!identity)
                throw new TextAiProbeUnavailableError(
                    'probe_route_unavailable',
                );
            await requireProbeReady(tx, { ...request, fingerprint: identity });
        },
        (providerId) =>
            Boolean(
                input.credentials[
                    `${providerId.toUpperCase()}_API_KEY` as keyof TextAiProviderCredentials
                ],
            ),
    );
    const executor =
        input.executor ??
        createTextAiProbeExecutor({
            credentials: input.credentials,
            flows: createTextAiSyntheticFlows(),
        });
    const probes = new TextAiProbeService(
        new DrizzleTextAiProbeStore(input.database),
        input.syntheticFixture
            ? createSyntheticAdminProbeExecutor(executor)
            : executor,
        input.limits,
        () => new Date(),
        input.timeoutMs,
    );
    const routes = new OpenAPIHono();
    routes.route(
        '/',
        createTextAiRoutingRoutes({
            store,
            administration: input.administration,
            policy: input.policy,
        }),
    );
    return { routes, probes, store };
}
