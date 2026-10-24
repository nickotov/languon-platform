import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { resolve, dirname } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
    evaluateReadiness,
    selectCapabilities,
    validateLocalEnvironment,
} from './dev-readiness/checks.mjs';
import {
    expectedMigrations,
    migrationStatus,
    readSnapshot,
} from './dev-readiness/database.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function doctor({
    envFile = '.env.local',
    learnerEmail,
    phase = 'runtime',
    capabilities = [],
    environment,
} = {}) {
    const env =
        environment ?? parseEnv(await readFile(resolve(root, envFile), 'utf8'));
    const selected = selectCapabilities(env, capabilities);
    // Explicit env-file is authoritative: shell production credentials cannot leak in.
    const identity = validateLocalEnvironment(env);
    const { createPostgresClient } =
        await import('../packages/database/dist/index.js');
    const client = createPostgresClient({
        databaseUrl: env.DATABASE_URL,
        maxConnections: 1,
        connectTimeoutSeconds: 3,
    });
    try {
        return await client.begin('read only', async (sql) => {
            await sql`set local statement_timeout='5000ms'`;
            const [{ relation }] =
                await sql`select to_regclass('languon_migrations.history')::text as relation`;
            const applied = relation
                ? await sql`select created_at,hash from languon_migrations.history order by created_at`
                : [];
            const migration = migrationStatus(
                applied,
                await expectedMigrations(root),
            );
            const checks = [migration];
            if (migration.status === 'pass')
                checks.push(
                    ...evaluateReadiness(
                        await readSnapshot(sql, learnerEmail),
                        env,
                        phase,
                        selected,
                    ),
                );
            return {
                identity,
                phase,
                capabilities: selected.map((capability) => capability.id),
                checks,
                ready: checks.every((check) => check.status === 'pass'),
                scope: 'Configuration prerequisites only; no generation, Redis connectivity, circuit-breaker state, exhausted daily quota, or provider connectivity is tested.',
            };
        });
    } finally {
        await client.end({ timeout: 2 });
    }
}

export function parseWaitMs(value) {
    if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value) > 15000)
        throw new Error('wait-ms must be an integer between 0 and 15000.');
    return Number(value);
}

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(process.argv[2] === '--' ? 3 : 2),
        options: {
            'env-file': { type: 'string', default: '.env.local' },
            'learner-email': { type: 'string' },
            capability: { type: 'string', multiple: true },
            'process-environment': { type: 'boolean', default: false },
            'wait-ms': { type: 'string', default: '0' },
            phase: { type: 'string', default: 'runtime' },
            json: { type: 'boolean', default: false },
            help: { type: 'boolean', default: false },
        },
    });
    if (values.help) {
        console.log(
            'node scripts/dev-doctor.mjs [--env-file FILE] [--phase configuration|runtime] [--learner-email EMAIL] [--capability texts,interview] [--wait-ms 15000] [--process-environment] [--json]\nRead-only local prerequisite inspection. Does not generate, configure, or charge.',
        );
        return;
    }
    if (!['configuration', 'runtime'].includes(values.phase))
        throw new Error('Invalid phase.');
    const waitMs = parseWaitMs(values['wait-ms']);
    const options = {
        envFile: values['env-file'],
        learnerEmail: values['learner-email'],
        phase: values.phase,
        capabilities: values.capability,
        environment: values['process-environment'] ? process.env : undefined,
    };
    const deadline = Date.now() + waitMs;
    let report = await doctor(options);
    while (
        Date.now() < deadline &&
        report.checks.some(
            (check) =>
                check.id.endsWith(':worker') && check.status === 'blocked',
        )
    ) {
        await setTimeout(Math.min(1000, deadline - Date.now()));
        report = await doctor(options);
    }
    if (values.json) console.log(JSON.stringify(report, null, 2));
    else {
        console.log(
            `Development readiness (${report.phase}) — ${report.identity.host}:${report.identity.port}/${report.identity.database}`,
        );
        for (const check of report.checks)
            console.log(
                `${check.status.toUpperCase()} ${check.id}: ${check.message}`,
            );
        console.log(report.scope);
    }
    process.exitCode = report.ready ? 0 : 1;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    main().catch(() => {
        // Driver errors can contain connection strings or server data. Never print them.
        console.error(
            'Development doctor could not inspect this environment. Check the local env file, database availability, current package builds and read permissions. Only loopback development/test databases are accepted.',
        );
        process.exitCode = 1;
    });
}
