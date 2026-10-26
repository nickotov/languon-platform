/** Reserve one synthetic request and simulate a worker disappearing before completion.
 * This deliberately leaves real admission state for the audited UI recovery journey. */
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { z } from 'zod';
import { databaseSchema } from '../../src/infrastructure/database/schema';
import { createTextAiRouteFingerprint } from '../../src/infrastructure/text-ai/route-fingerprint';
import { DrizzleTextAiProbeStore } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-probe-store';
import { textAiFixtureCredentials } from './text-ai-routing-fixture';

const url = process.env.ADMIN_E2E_DATABASE_URL;
if (
    process.env.APP_ENV !== 'test' ||
    process.env.ADMIN_E2E_SYNTHETIC_PROBES !== 'true' ||
    !url
)
    throw new Error(
        'Explicit disposable synthetic probe fixture opt-in is required.',
    );
const target = new URL(url);
if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !/(?:admin.*e2e|e2e.*admin).*test/i.test(target.pathname) ||
    !target.port ||
    target.port === '5432'
)
    throw new Error(
        'A dedicated disposable loopback admin E2E database on a nondefault port is required.',
    );
const actorId = z.uuid().parse(process.argv[2]);
const routeId = 'deepseek/deepseek-flash';
const fingerprint = createTextAiRouteFingerprint(textAiFixtureCredentials)(
    routeId,
    'sentence-check',
);
if (!fingerprint) throw new Error('Synthetic flow fingerprint is missing.');
const client = createPostgresClient({ databaseUrl: url, maxConnections: 1 });
try {
    const reservation = await new DrizzleTextAiProbeStore(
        createDrizzleDatabase(client, databaseSchema),
    ).reserve({
        actorId,
        identity: {
            routeId,
            providerId: 'deepseek',
            modelId: 'deepseek-flash',
            fingerprint,
        },
        request: {
            routeId,
            kind: 'flow',
            flowId: 'sentence-check',
            approvedMaximumCostUsd: '0.01',
        },
        at: new Date(),
        limits: {
            maximumCostMicros: 10000n,
            dailyMaximumCostMicros: 100000n,
            cooldownSeconds: 0,
            evidenceHours: 24,
        },
    });
    process.stdout.write(JSON.stringify({ probeId: reservation.id }));
} finally {
    await client.end();
}
