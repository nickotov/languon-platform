import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { serve } from '@hono/node-server';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import {
    loadAdminMcpEnvironment,
    loadTextAiProbeEnvironment,
    loadTextAiProviderCredentials,
} from '../../config/environment';
import { databaseSchema } from '../database/schema';
import { AdminMcpCredentialService } from '../../modules/admin-mcp/application/admin-mcp-credential-service';
import { DrizzleAdminMcpStore } from '../../modules/admin-mcp/infrastructure/persistence/drizzle/drizzle-admin-mcp-store';
import { AdminMcpOperations } from '../../modules/admin-mcp/infrastructure/operations/admin-mcp-operations';
import { AdminMcpAdministrationService } from '../../modules/admin-mcp/application/admin-mcp-administration-service';
import { AdminMcpAdministrationAdapter } from '../../modules/admin-mcp/infrastructure/admin-mcp-administration-adapter';
import { createAdminMcpServer } from '../../modules/admin-mcp/interface/http/admin-mcp-server';
import { createAdminMcpChecks } from '../../modules/admin-mcp/infrastructure/admin-mcp-checks';
import { DrizzleTextAiRoutingStore } from '../../modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';
import {
    requireProbeReady,
    DrizzleTextAiProbeStore,
} from '../../modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-probe-store';
import { createTextAiRouteFingerprint } from '../text-ai/route-fingerprint';
import { TextAiProbeUnavailableError } from '../../modules/text-ai/application/ports/text-ai-probe-store';
import { TextAiProbeService } from '../../modules/text-ai/application/text-ai-probe-service';
import { createTextAiProbeExecutor } from '../../modules/text-ai/infrastructure/ai/text-ai-probe-executor';
import { createTextAiSyntheticFlows } from '../text-ai/probe-flow-registry';
import { DrizzleProviderPriceStore } from '../../modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { DrizzleAccountingStore } from '../../modules/ai-credits/infrastructure/persistence/drizzle/drizzle-accounting-store';
import { DrizzleAiCreditTransactionParticipant } from '../../modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';

const local = new URL('../../../../../.env.local', import.meta.url);
if (existsSync(local)) loadEnvFile(local);
const env = loadAdminMcpEnvironment();
const sql = createPostgresClient({
    databaseUrl: env.DATABASE_URL,
    maxConnections: env.ADMIN_MCP_MAX_CONNECTIONS,
});
const reportsSql = createPostgresClient({
    databaseUrl: env.DATABASE_URL,
    maxConnections: 1,
});
const database = createDrizzleDatabase(sql, databaseSchema);
const reportsDatabase = createDrizzleDatabase(reportsSql, databaseSchema);
const credentials = new AdminMcpCredentialService(
    new DrizzleAdminMcpStore(database),
);
const providerKeys = loadTextAiProviderCredentials();
const fingerprint = createTextAiRouteFingerprint(providerKeys);
const routing = new DrizzleTextAiRoutingStore(
    database,
    async (tx, request) => {
        const identity = fingerprint(request.routeId, request.flowId);
        if (!identity)
            throw new TextAiProbeUnavailableError('probe_route_unavailable');
        await requireProbeReady(tx, { ...request, fingerprint: identity });
    },
    (providerId) =>
        Boolean(
            providerKeys[
                `${providerId.toUpperCase()}_API_KEY` as keyof typeof providerKeys
            ],
        ),
);
const accounting = new DrizzleAccountingStore(
    reportsDatabase,
    (tx) => new DrizzleAiCreditTransactionParticipant(tx),
);
const operations = new AdminMcpOperations(database, {
    routing,
    providerPrices: new DrizzleProviderPriceStore(database),
    accounting,
});
const probeEnv = loadTextAiProbeEnvironment();
const probes = new TextAiProbeService(
    new DrizzleTextAiProbeStore(database),
    createTextAiProbeExecutor({
        credentials: providerKeys,
        flows: createTextAiSyntheticFlows(),
    }),
    probeEnv.limits,
    () => new Date(),
    probeEnv.timeoutMs,
);
const checks = createAdminMcpChecks(database, credentials, probes);
const app = createAdminMcpServer({
    credentials,
    administration: new AdminMcpAdministrationService(
        new AdminMcpAdministrationAdapter(database, operations),
    ),
    checks,
    port: env.ADMIN_MCP_PORT,
});
const server = serve({
    fetch: app.fetch,
    hostname: '127.0.0.1',
    port: env.ADMIN_MCP_PORT,
});
console.info(
    `Local admin MCP listening on http://127.0.0.1:${env.ADMIN_MCP_PORT}/mcp`,
);
let stopping = false;
async function stop() {
    if (stopping) return;
    stopping = true;
    server.close();
    await Promise.all([sql.end(), reportsSql.end()]);
}
process.once('SIGTERM', () => {
    void stop();
});
process.once('SIGINT', () => {
    void stop();
});
