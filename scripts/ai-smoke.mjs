import { readFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    CredentialsSchema,
    EMAIL,
    ROUTE,
    SmokeError,
    TaskSchema,
    requireSafe,
} from './ai-smoke/policy.mjs';
import { privateRead, withJournal } from './ai-smoke/journal.mjs';
import { createApi, runJourney } from './ai-smoke/journey.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseOptions(args) {
    const { values } = parseArgs({
        args: args[0] === '--' ? args.slice(1) : args,
        options: {
            run: { type: 'boolean', default: false },
            initialize: { type: 'boolean', default: false },
            task: { type: 'string' },
            help: { type: 'boolean', default: false },
        },
    });
    requireSafe(!(values.run && values.initialize), 'choose-run-or-initialize');
    if (values.run) TaskSchema.parse(values.task);
    requireSafe(!values.task || values.run, 'task-requires-run');
    return values;
}

export async function main(args = process.argv.slice(2)) {
    const options = parseOptions(args);
    if (options.help) {
        console.log(
            'pnpm ai:smoke [--initialize | --run --task stable-task-slug]\nDefault: read-only preflight. Uses only .env.local and dedicated .env.ai-smoke.local (or AI_SMOKE_* environment). One synthetic learner conversation per --run; no retry/top-up. Local journal holds $0.10 per attempt permanently; max 2 per task and conservative $0.50 per UTC day including all application operator expenses. Keep evidence and never remove/reset journal or stale locks without reconciliation.',
        );
        return;
    }
    let fileCredentials = {};
    try {
        fileCredentials = parseEnv(
            await privateRead(resolve(root, '.env.ai-smoke.local')),
        );
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const credentials = CredentialsSchema.parse(
        Object.fromEntries(
            ['AI_SMOKE_EMAIL', 'AI_SMOKE_PASSWORD', 'AI_SMOKE_USER_ID'].map(
                (key) => [key, process.env[key] ?? fileCredentials[key]],
            ),
        ),
    );
    const env = parseEnv(await readFile(resolve(root, '.env.local'), 'utf8'));
    const { openInspection } = await import('./ai-smoke/inspect.mjs');
    const inspection = await openInspection(
        root,
        env,
        credentials.AI_SMOKE_USER_ID,
    );
    try {
        if (!options.run && !options.initialize) {
            const current = await inspection.inspect();
            console.log(
                JSON.stringify({
                    status: 'preflight-pass',
                    paidCalls: 0,
                    account: EMAIL,
                    route: ROUTE,
                    day: current.day,
                    scope: 'Configuration/readiness only; no learner login or provider request. Run still requires initialized quota journal and available allowance.',
                }),
            );
            return;
        }
        await withJournal(
            root,
            credentials.AI_SMOKE_USER_ID,
            async (journal) => {
                const initial = await inspection.inspect();
                if (options.initialize) {
                    await journal.initialize(initial.historicalActions);
                    console.log(
                        JSON.stringify({
                            status: 'journal-initialized',
                            paidCalls: 0,
                        }),
                    );
                    return;
                }
                await journal.read();
                // Avoid ambiguous UTC-day accounting across a running request.
                requireSafe(
                    Date.now() % 86400000 < 86400000 - 300000,
                    'utc-rollover-window',
                );
                const contracts =
                    await import('../packages/contracts/dist/index.js');
                const api = createApi(contracts);
                try {
                    const login = await api.login(credentials);
                    await inspection.bindSession(login);
                    const current = await inspection.inspect();
                    requireSafe(
                        current.day === initial.day &&
                            current.routingRevision === initial.routingRevision,
                        'preflight-changed-no-dispatch',
                    );
                    const reservation = await journal.reserve(
                        options.task,
                        current.day,
                        current.globalExposureMicros,
                    );
                    const result = await runJourney({
                        api,
                        contracts,
                        journal,
                        reservation,
                        inspect: inspection.inspect,
                        initial: current,
                        verifyExpense: inspection.verifyExpense,
                    });
                    console.log(
                        JSON.stringify({
                            ...result,
                            task: options.task,
                            route: ROUTE,
                            reservedUsd: '0.10',
                            syntheticArtifacts:
                                'retained-with-billing-evidence',
                        }),
                    );
                } finally {
                    try {
                        await api.logout();
                    } catch {
                        console.error(
                            'Smoke session logout failed; session expires normally. No retry or paid action was performed by logout.',
                        );
                    }
                }
            },
        );
    } finally {
        await inspection.close();
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    main().catch((error) => {
        console.error(
            `AI smoke stopped: ${error instanceof SmokeError ? error.message : 'local-preflight-or-contract-failure'}. No automatic retry; any existing quota reservation and synthetic artifacts are retained. Inspect local readiness and journal without publishing credentials or response text.`,
        );
        process.exitCode = 1;
    });
}
