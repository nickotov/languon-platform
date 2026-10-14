import { drizzle } from 'drizzle-orm/postgres-js';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import type { PostgresClient } from '../postgres/client';
import { parseEnumExpansion } from './enum-expansion';

const disposableMigrationPurposeBrand = Symbol(
    'languon.disposableMigrationPurpose',
);

export interface ApplicationMigrationPurpose {
    kind: 'application';
}

export interface DisposableMigrationPurpose {
    readonly [disposableMigrationPurposeBrand]: true;
    kind: 'disposable';
}

export type MigrationPurpose =
    ApplicationMigrationPurpose | DisposableMigrationPurpose;

export interface RunPostgresMigrationsOptions {
    client: PostgresClient;
    migrationsFolder: string;
    purpose: MigrationPurpose;
}

export class MigrationHistoryMismatchError extends Error {
    public constructor(createdAt: number) {
        super(
            `Applied migration ${createdAt} does not match the checked-in history.`,
        );
        this.name = 'MigrationHistoryMismatchError';
    }
}

class EnumExpansionOrderMismatchError extends Error {
    public constructor() {
        super('Existing enum label does not match pending migration order.');
        this.name = 'EnumExpansionOrderMismatchError';
    }
}

interface MigrationHistoryEntry {
    createdAt: number;
    hash: string;
}

export function assertAppliedMigrationPrefix(
    appliedMigrations: readonly MigrationHistoryEntry[],
    expectedMigrations: readonly MigrationHistoryEntry[],
): void {
    for (const [index, applied] of appliedMigrations.entries()) {
        const expected = expectedMigrations[index];

        if (
            !expected ||
            expected.createdAt !== applied.createdAt ||
            expected.hash !== applied.hash
        ) {
            throw new MigrationHistoryMismatchError(applied.createdAt);
        }
    }
}

const advisoryLockNamespace = 1_814_072_415;
const advisoryLockIdentifier = 1_297_895_956;

export function grantDisposableMigrationPurpose(): DisposableMigrationPurpose {
    return {
        [disposableMigrationPurposeBrand]: true,
        kind: 'disposable',
    };
}

function assertMigrationPurpose(purpose: MigrationPurpose): void {
    if (
        purpose.kind === 'disposable' &&
        purpose[disposableMigrationPurposeBrand] !== true
    ) {
        throw new TypeError(
            'Disposable migrations require an explicit trusted capability.',
        );
    }
}

async function assertMigrationHistoryMatches(
    connection: PostgresClient,
    migrationsFolder: string,
): Promise<number> {
    const relation = await connection<{ name: string | null }[]>`
    select to_regclass('languon_migrations.history')::text as name
  `;

    if (!relation[0]?.name) {
        return 0;
    }

    const appliedMigrations = await connection<
        { created_at: string; hash: string }[]
    >`
    select created_at, hash
    from languon_migrations.history
    order by created_at
  `;
    const expectedMigrations = readMigrationFiles({ migrationsFolder }).map(
        (migration) => ({
            createdAt: migration.folderMillis,
            hash: migration.hash,
        }),
    );

    assertAppliedMigrationPrefix(
        appliedMigrations.map((migration) => ({
            createdAt: Number(migration.created_at),
            hash: migration.hash,
        })),
        expectedMigrations,
    );
    return appliedMigrations.length;
}

export async function runPostgresMigrations(
    options: RunPostgresMigrationsOptions,
): Promise<void> {
    assertMigrationPurpose(options.purpose);

    const connection = await options.client.reserve();
    const originalUnsafe = connection.unsafe;
    // postgres.js reserved connections intentionally omit pool-only properties.
    // Drizzle needs the parsers plus `begin`; the small transaction adapter keeps
    // every migration statement on this reserved session so the advisory lock
    // covers the complete migration.
    Object.assign(connection, {
        begin: async <T>(
            work: (transaction: typeof connection) => Promise<T>,
        ) => {
            await connection.unsafe('begin');
            try {
                const result = await work(connection);
                await connection.unsafe('commit');
                return result;
            } catch (error) {
                await connection.unsafe('rollback');
                throw error;
            }
        },
        options: options.client.options,
    });

    const precommittedSql = new Set<string>();
    // Only additive enum SQL becomes idempotent. Retrying after an ordinary DDL
    // rollback must reuse a label whose required commit happened beforehand.
    connection.unsafe = ((query, ...args) => {
        const expansion = parseEnumExpansion(query);
        return originalUnsafe(
            expansion && precommittedSql.has(expansion.sql)
                ? expansion.sql
                : query,
            ...args,
        );
    }) as typeof connection.unsafe;

    try {
        await connection`select pg_advisory_lock(${advisoryLockNamespace}, ${advisoryLockIdentifier})`;

        try {
            const appliedCount = await assertMigrationHistoryMatches(
                connection,
                options.migrationsFolder,
            );
            const pending = readMigrationFiles({
                migrationsFolder: options.migrationsFolder,
            }).slice(appliedCount);
            const expansions = pending.flatMap((migration) =>
                migration.sql.flatMap((statement) => {
                    const expansion = parseEnumExpansion(statement);
                    return expansion ? [expansion] : [];
                }),
            );
            const existingTypes = new Map<string, string>();
            for (const expansion of expansions) {
                const [type] = await connection<{ oid: string | null }[]>`
                    select to_regtype(${expansion.typeName})::oid::text as oid
                `;
                if (type?.oid) existingTypes.set(expansion.typeName, type.oid);
            }
            const seenLabels = new Set<string>();
            for (const expansion of expansions) {
                const oid = existingTypes.get(expansion.typeName);
                if (!oid) continue;
                const key = JSON.stringify([oid, expansion.label]);
                if (seenLabels.has(key) && !expansion.ifNotExists) {
                    throw new Error(
                        'Pending migrations contain a duplicate enum label addition.',
                    );
                }
                seenLabels.add(key);
            }
            const expectedOrders = new Map<string, string[]>();
            for (const oid of new Set(existingTypes.values())) {
                const additions = expansions.filter(
                    (item) => existingTypes.get(item.typeName) === oid,
                );
                const labels = await connection<{ enumlabel: string }[]>`
                    select enumlabel from pg_enum where enumtypid = ${oid}::oid order by enumsortorder
                `;
                const pendingLabels = new Set(
                    additions.map((item) => item.label),
                );
                const actual = labels.map((item) => item.enumlabel);
                const expected = actual.filter(
                    (label) => !pendingLabels.has(label),
                );
                for (const addition of additions) {
                    if (expected.includes(addition.label)) continue;
                    if (addition.placement) {
                        const neighborIndex = expected.indexOf(
                            addition.placement.neighbor,
                        );
                        if (neighborIndex < 0)
                            throw new EnumExpansionOrderMismatchError();
                        expected.splice(
                            neighborIndex +
                                (addition.placement.direction === 'after'
                                    ? 1
                                    : 0),
                            0,
                            addition.label,
                        );
                    } else expected.push(addition.label);
                }
                expectedOrders.set(oid, expected);
                const actualLabels = new Set(actual);
                if (
                    JSON.stringify(
                        expected.filter((label) => actualLabels.has(label)),
                    ) !== JSON.stringify(actual)
                ) {
                    throw new EnumExpansionOrderMismatchError();
                }
            }
            for (const [index, expansion] of expansions.entries()) {
                const oid = existingTypes.get(expansion.typeName);
                if (!oid) continue;
                const laterLabels = new Set(
                    expansions
                        .slice(index + 1)
                        .filter(
                            (later) =>
                                existingTypes.get(later.typeName) === oid,
                        )
                        .map((later) => later.label),
                );
                const validateOrder = async (
                    requireLabel: boolean,
                ): Promise<void> => {
                    const labels = await connection<
                        { enumlabel: string; enumsortorder: number }[]
                    >`
                        select enumlabel, enumsortorder from pg_enum
                        where enumtypid = ${oid}::oid order by enumsortorder
                    `;
                    const current = labels.find(
                        (label) => label.enumlabel === expansion.label,
                    );
                    if (!current) {
                        if (requireLabel)
                            throw new EnumExpansionOrderMismatchError();
                        return;
                    }
                    if (expansion.placement) {
                        const neighbor = labels.find(
                            (label) =>
                                label.enumlabel ===
                                expansion.placement!.neighbor,
                        );
                        if (
                            !neighbor ||
                            (expansion.placement.direction === 'before'
                                ? current.enumsortorder >=
                                  neighbor.enumsortorder
                                : current.enumsortorder <=
                                  neighbor.enumsortorder)
                        ) {
                            throw new EnumExpansionOrderMismatchError();
                        }
                    } else if (
                        labels.some(
                            (label) =>
                                label.enumlabel !== expansion.label &&
                                !laterLabels.has(label.enumlabel) &&
                                label.enumsortorder >= current.enumsortorder,
                        )
                    ) {
                        throw new EnumExpansionOrderMismatchError();
                    }
                };
                await validateOrder(false);
                // Existing enum labels must commit before ordinary DDL uses them.
                // Keep the session lock across this narrow autocommit exception.
                await originalUnsafe(expansion.sql);
                await validateOrder(true);
                precommittedSql.add(expansion.sql);
            }
            for (const [oid, expected] of expectedOrders) {
                const labels = await connection<{ enumlabel: string }[]>`
                    select enumlabel from pg_enum where enumtypid = ${oid}::oid order by enumsortorder
                `;
                if (
                    JSON.stringify(labels.map((item) => item.enumlabel)) !==
                    JSON.stringify(expected)
                ) {
                    throw new EnumExpansionOrderMismatchError();
                }
            }
            await migrate(drizzle(connection), {
                migrationsFolder: options.migrationsFolder,
                migrationsSchema: 'languon_migrations',
                migrationsTable: 'history',
            });
        } finally {
            await connection`select pg_advisory_unlock(${advisoryLockNamespace}, ${advisoryLockIdentifier})`;
        }
    } finally {
        connection.unsafe = originalUnsafe;
        connection.release();
    }
}
