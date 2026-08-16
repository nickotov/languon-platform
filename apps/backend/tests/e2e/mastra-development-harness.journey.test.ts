import { RequestContext } from '@mastra/core/request-context';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { databaseSchema } from '../../src/infrastructure/database/schema';
import { resolveMigrationsFolder } from '../../src/infrastructure/database/migrations-folder';
import { loadPlaygroundEnvironment } from '../../src/infrastructure/playground/playground-environment';
import { runPlaygroundLifecycle } from '../../src/infrastructure/playground/playground-lifecycle';
import { DevelopmentVerificationService } from '../../src/modules/development-harness/application/development-verification-service';
import { developmentHarnessFixture } from '../../src/modules/development-harness/infrastructure/development-fixture';
import { createDevelopmentHarnessPrimitives } from '../../src/modules/development-harness/infrastructure/mastra/development-harness-primitives';
import { DrizzleDevelopmentPrincipalReader } from '../../src/modules/development-harness/infrastructure/persistence/drizzle-development-principal-reader';

const enabled =
    process.env.ALLOW_MASTRA_PLAYGROUND_DATABASE_TESTS === 'true' &&
    typeof process.env.MASTRA_PLAYGROUND_TEST_ADMIN_DATABASE_URL === 'string';

// @user-flow-revision mastra-agent-development-harness sha256:cc2c9d838f9e8b68
describe.runIf(enabled)('Mastra development harness journey', () => {
    // @user-flow mastra-agent-development-harness/playground-provision-run-persist-reset
    it('provisions, runs, persists, isolates, and safely resets the playground', async () => {
        const adminDatabaseUrl =
            process.env.MASTRA_PLAYGROUND_TEST_ADMIN_DATABASE_URL!;
        const adminUrl = new URL(adminDatabaseUrl);
        const ordinaryUrl = new URL(adminUrl);
        ordinaryUrl.pathname = '/languon';
        const targetUrl = new URL(adminUrl);
        targetUrl.pathname = '/languon_mastra_playground_e2e_test';
        const environment = loadPlaygroundEnvironment({
            APP_ENV: 'test',
            DATABASE_URL: ordinaryUrl.href,
            MASTRA_DEV_HARNESS: 'true',
            MASTRA_PLAYGROUND_ADMIN_DATABASE_URL: adminDatabaseUrl,
            MASTRA_PLAYGROUND_DATABASE_URL: targetUrl.href,
        });
        const migrationsFolder = resolveMigrationsFolder();

        const initialResults = await Promise.all([
            runPlaygroundLifecycle({
                environment,
                migrationsFolder,
                mode: 'provision',
            }),
            runPlaygroundLifecycle({
                environment,
                migrationsFolder,
                mode: 'provision',
            }),
        ]);
        expect(initialResults.map(({ created }) => created).sort()).toEqual([
            false,
            true,
        ]);
        expect(initialResults.every(({ reset }) => reset === false)).toBe(true);

        let target = createPostgresClient({ databaseUrl: targetUrl.href });
        const migrationCount = await target<{ count: string }[]>`
            select count(*) from languon_migrations.history
        `;
        const expectedMigrationCount = readdirSync(migrationsFolder).filter(
            (name) => name.endsWith('.sql'),
        ).length;
        const fixtures = await target<
            { id: string; status: string; verified_at: Date | null }[]
        >`
            select users.id, users.status, user_emails.verified_at
            from users
            inner join user_emails on user_emails.user_id = users.id
            where users.id = ${developmentHarnessFixture.principalId}
        `;
        expect(Number(migrationCount[0]?.count)).toBe(expectedMigrationCount);
        expect(fixtures).toEqual([
            expect.objectContaining({
                id: developmentHarnessFixture.principalId,
                status: 'active',
                verified_at: expect.any(Date),
            }),
        ]);

        const service = new DevelopmentVerificationService(
            new DrizzleDevelopmentPrincipalReader(
                createDrizzleDatabase(target, databaseSchema),
            ),
            developmentHarnessFixture.principalId,
        );
        const primitives = createDevelopmentHarnessPrimitives({
            modelCredentialAvailable: false,
            modelId: 'openai/gpt-5-mini',
            service,
        });
        const requestContext = new RequestContext<{
            syntheticPrincipalId: string;
            variant: 'concise' | 'diagnostic';
        }>([
            ['syntheticPrincipalId', developmentHarnessFixture.principalId],
            ['variant', 'diagnostic'],
        ]);
        const workflowRun = await primitives.verificationWorkflow.createRun();
        const workflowResult = await workflowRun.start({
            inputData: { delayMs: 0, message: 'disposable journey' },
            requestContext,
        });
        expect(workflowResult).toMatchObject({
            result: {
                principalId: developmentHarnessFixture.principalId,
                trace: { primitive: 'workflow', status: 'success' },
            },
            status: 'success',
        });
        const score = await primitives.verificationScorer.run({
            input: {
                expectedPrincipalId: developmentHarnessFixture.principalId,
            },
            output:
                workflowResult.status === 'success'
                    ? workflowResult.result
                    : undefined!,
        });
        expect(score).toMatchObject({ score: 1 });

        await target`
            insert into users (id, status)
            values ('00000000-0000-4000-8000-000000000099', 'active')
        `;
        await target.end();

        const repeated = await runPlaygroundLifecycle({
            environment,
            migrationsFolder,
            mode: 'provision',
        });
        expect(repeated.created).toBe(false);

        target = createPostgresClient({ databaseUrl: targetUrl.href });
        const persistedMarker = await target<{ count: string }[]>`
            select count(*) from users
            where id = '00000000-0000-4000-8000-000000000099'
        `;
        expect(persistedMarker[0]?.count).toBe('1');
        await target.end();

        const ordinary = createPostgresClient({
            databaseUrl: ordinaryUrl.href,
        });
        const ordinaryHasUsers = await ordinary<{ users: string | null }[]>`
            select to_regclass('public.users')::text as users
        `;
        expect(ordinaryHasUsers[0]?.users).toBeNull();
        await ordinary.end();

        await expect(
            runPlaygroundLifecycle({
                environment,
                migrationsFolder,
                mode: 'reset',
            }),
        ).rejects.toThrow('Reset refused');

        const confirmedEnvironment = {
            ...environment,
            resetConfirmation: environment.databaseName,
        };
        const reset = await runPlaygroundLifecycle({
            environment: confirmedEnvironment,
            migrationsFolder,
            mode: 'reset',
        });
        expect(reset).toMatchObject({ created: true, reset: true });

        target = createPostgresClient({ databaseUrl: targetUrl.href });
        const afterReset = await target<
            { fixture_count: string; marker_count: string }[]
        >`
            select
                count(*) filter (
                    where id = ${developmentHarnessFixture.principalId}
                )::text as fixture_count,
                count(*) filter (
                    where id = '00000000-0000-4000-8000-000000000099'
                )::text as marker_count
            from users
        `;
        expect(afterReset[0]).toEqual({
            fixture_count: '1',
            marker_count: '0',
        });
        await target.end();

        await expect(
            Promise.all([
                runPlaygroundLifecycle({
                    environment,
                    migrationsFolder,
                    mode: 'provision',
                }),
                runPlaygroundLifecycle({
                    environment: confirmedEnvironment,
                    migrationsFolder,
                    mode: 'reset',
                }),
            ]),
        ).resolves.toHaveLength(2);

        target = createPostgresClient({ databaseUrl: targetUrl.href });
        const afterConcurrentLifecycle = await target<{ count: string }[]>`
            select count(*) from users
            where id = ${developmentHarnessFixture.principalId}
        `;
        expect(afterConcurrentLifecycle[0]?.count).toBe('1');
        await target.end();
    });
});
