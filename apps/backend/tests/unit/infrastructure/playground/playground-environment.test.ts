import { describe, expect, it } from 'vitest';

import {
    loadPlaygroundEnvironment,
    UnsafePlaygroundTargetError,
} from '../../../../src/infrastructure/playground/playground-environment';

function environment(
    overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
    return {
        APP_ENV: 'test',
        DATABASE_URL: 'postgres://languon:local@localhost:5432/languon',
        MASTRA_DEV_HARNESS: 'true',
        MASTRA_PLAYGROUND_ADMIN_DATABASE_URL:
            'postgres://languon:local@localhost:5432/postgres',
        MASTRA_PLAYGROUND_DATABASE_URL:
            'postgres://languon:local@localhost:5432/languon_mastra_playground_test',
        ...overrides,
    };
}

describe('Mastra playground environment', () => {
    it('accepts an explicit loopback playground and separate admin database', () => {
        expect(loadPlaygroundEnvironment(environment())).toMatchObject({
            appEnvironment: 'test',
            databaseName: 'languon_mastra_playground_test',
            modelId: 'openai/gpt-5-mini',
            promptMode: 'local',
        });
    });

    it.each([
        {
            name: 'ordinary application database',
            override: {
                MASTRA_PLAYGROUND_DATABASE_URL:
                    'postgres://languon:local@localhost:5432/languon',
            },
        },
        {
            name: 'remote host',
            override: {
                MASTRA_PLAYGROUND_ADMIN_DATABASE_URL:
                    'postgres://languon:local@db.example.test:5432/postgres',
                MASTRA_PLAYGROUND_DATABASE_URL:
                    'postgres://languon:local@db.example.test:5432/languon_mastra_playground_test',
            },
        },
        {
            name: 'different admin authority',
            override: {
                MASTRA_PLAYGROUND_ADMIN_DATABASE_URL:
                    'postgres://other:local@localhost:5432/postgres',
            },
        },
        {
            name: 'non-admin database',
            override: {
                MASTRA_PLAYGROUND_ADMIN_DATABASE_URL:
                    'postgres://languon:local@localhost:5432/languon',
            },
        },
        {
            name: 'unsafe target name',
            override: {
                MASTRA_PLAYGROUND_DATABASE_URL:
                    'postgres://languon:local@localhost:5432/languon_mastra_playground-production',
            },
        },
        {
            name: 'application URL alias',
            override: {
                DATABASE_URL:
                    'postgres://languon:local@localhost:5432/languon_mastra_playground_test',
            },
        },
        {
            name: 'semantic application URL alias',
            override: {
                DATABASE_URL:
                    'postgresql://other:credentials@127.0.0.1/languon_mastra_playground_test',
            },
        },
        ...['[::1]', '[::ffff:127.0.0.1]', '127.1', '127.0.0.2'].map(
            (host) => ({
                name: `application URL loopback alias ${host}`,
                override: {
                    DATABASE_URL: `postgres://other:credentials@${host}/languon_mastra_playground_test`,
                },
            }),
        ),
    ])('rejects $name', ({ override }) => {
        expect(() => loadPlaygroundEnvironment(environment(override))).toThrow(
            UnsafePlaygroundTargetError,
        );
    });

    it('rejects deployed harness modes before target evaluation', () => {
        expect(() =>
            loadPlaygroundEnvironment(environment({ APP_ENV: 'production' })),
        ).toThrow();
    });
});
