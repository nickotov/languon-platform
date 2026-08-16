import {
    createDrizzleDatabase,
    createPostgresClient,
    grantDisposableMigrationPurpose,
    runPostgresMigrations,
    type PostgresClient,
} from '@languon/database';

import { databaseSchema } from '../database/schema';
import { seedDevelopmentHarnessFixture } from '../../modules/development-harness/infrastructure/development-fixture';
import type { PlaygroundEnvironment } from './playground-environment';

const lifecycleLockNamespace = 1_814_072_415;
const lifecycleLockIdentifier = 1_297_895_957;

export interface PlaygroundLifecycleOptions {
    environment: PlaygroundEnvironment;
    migrationsFolder: string;
    mode: 'provision' | 'reset';
}

export interface PlaygroundLifecycleResult {
    created: boolean;
    databaseName: string;
    reset: boolean;
}

export async function runPlaygroundLifecycle(
    options: PlaygroundLifecycleOptions,
): Promise<PlaygroundLifecycleResult> {
    if (
        options.mode === 'reset' &&
        options.environment.resetConfirmation !==
            options.environment.databaseName
    ) {
        throw new Error(
            'Reset refused: MASTRA_PLAYGROUND_RESET_CONFIRM must exactly match the playground database name.',
        );
    }

    const admin = createPostgresClient({
        connectTimeoutSeconds: 2,
        databaseUrl: options.environment.adminDatabaseUrl,
        maxConnections: 1,
    });
    let created = false;

    try {
        await waitForPostgres(admin);
        const connection = await admin.reserve();

        try {
            await connection`select pg_advisory_lock(${lifecycleLockNamespace}, ${lifecycleLockIdentifier})`;
            try {
                const exists = await databaseExists(
                    connection,
                    options.environment.databaseName,
                );

                if (options.mode === 'reset' && exists) {
                    await connection.unsafe(
                        `drop database ${quoteIdentifier(options.environment.databaseName)} with (force)`,
                    );
                }

                if (!exists || options.mode === 'reset') {
                    await connection.unsafe(
                        `create database ${quoteIdentifier(options.environment.databaseName)}`,
                    );
                    created = true;
                }

                await migrateAndSeedTarget(options);
            } finally {
                await connection`select pg_advisory_unlock(${lifecycleLockNamespace}, ${lifecycleLockIdentifier})`;
            }
        } finally {
            connection.release();
        }
    } finally {
        await admin.end();
    }

    return {
        created,
        databaseName: options.environment.databaseName,
        reset: options.mode === 'reset',
    };
}

async function migrateAndSeedTarget(
    options: PlaygroundLifecycleOptions,
): Promise<void> {
    const target = createPostgresClient({
        databaseUrl: options.environment.databaseUrl,
        maxConnections: 2,
    });

    try {
        await runPostgresMigrations({
            client: target,
            migrationsFolder: options.migrationsFolder,
            purpose: grantDisposableMigrationPurpose(),
        });
        await seedDevelopmentHarnessFixture(
            createDrizzleDatabase(target, databaseSchema),
        );
    } finally {
        await target.end();
    }
}

async function waitForPostgres(client: PostgresClient): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            await client`select 1`;
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }

    throw new Error('Local PostgreSQL did not become ready in time.', {
        cause: lastError,
    });
}

async function databaseExists(
    connection: PostgresClient,
    databaseName: string,
): Promise<boolean> {
    const rows = await connection<{ exists: boolean }[]>`
        select exists(select 1 from pg_database where datname = ${databaseName})
    `;
    return rows[0]?.exists === true;
}

function quoteIdentifier(identifier: string): string {
    return `"${identifier.replaceAll('"', '""')}"`;
}
