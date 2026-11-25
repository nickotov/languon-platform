import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();

async function violations(layer, source, filename = 'probe.ts') {
    const [result] = await eslint.lintText(source, {
        filePath: `apps/backend/src/modules/users/${layer}/${filename}`,
    });

    assert.equal(result.fatalErrorCount, 0);

    return result.messages.filter(
        ({ ruleId }) => ruleId === 'backend-ddd/inward-dependencies',
    );
}

test('domain and application dependencies point inward across module boundaries', async () => {
    for (const [layer, source] of [
        ['domain', "import type { User } from '../application/user';"],
        [
            'domain',
            "export * from '../../speech/infrastructure/drizzle-speech-store';",
        ],
        ['domain', "import type { Context } from 'hono';"],
        [
            'application',
            "export type Store = import('drizzle-orm/postgres-js').Database;",
        ],
        ['application', "void import('../../../config/environment');"],
        ['application', "import { Redis } from 'ioredis';"],
        ['application', "import { routes } from '../interface/http/routes';"],
    ]) {
        assert.equal((await violations(layer, source)).length, 1, source);
    }
});

test('allows domain policies, application ports, shared contracts and adapters in their owning layer', async () => {
    for (const [layer, source, file] of [
        ['application', "import type { Account } from '../domain/account';"],
        ['application', "export * from './ports/store';"],
        ['domain', "export * from '../../speech/domain/audio-integrity';"],
        ['application', "export * from '../../users/application/ports/store';"],
        ['domain', "export type { Account } from '@languon/contracts';"],
        ['infrastructure', "import { sql } from 'drizzle-orm';"],
        [
            'domain',
            "import { fakeStore } from '../infrastructure/store';",
            'account.test.ts',
        ],
    ]) {
        assert.deepEqual(await violations(layer, source, file), [], source);
    }
});
