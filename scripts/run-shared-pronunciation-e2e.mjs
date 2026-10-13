import { spawnSync } from 'node:child_process';

// Both project configurations enforce isolated, loopback-only fixture services.
const journeys = [
    [
        '--filter',
        '@languon/web',
        'test:e2e',
        'tests/e2e/shared-pronunciation.journeys.spec.ts',
    ],
    [
        '--filter',
        '@languon/web',
        'test:e2e',
        'tests/e2e/flashcard-training.journeys.spec.ts',
        'tests/e2e/sentence-practice.journeys.spec.ts',
        '--grep',
        'owner configures a session|anonymous shared practice|checks owner practice',
    ],
    [
        '--filter',
        '@languon/admin',
        'test:e2e',
        'tests/e2e/admin-user-management.journeys.spec.ts',
        '--grep',
        'owner searches the retained speech|owner publishes an immutable speech|owner previews private speech bytes',
    ],
];
for (const args of journeys) {
    const result = spawnSync('pnpm', args, {
        stdio: 'inherit',
        env: { ...process.env, AUTH_E2E_SENTENCE_SERVICES: 'true' },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
