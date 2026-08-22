import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compatibleCommandIds } from '../public/selection.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));

test('production bulk selection contains no conflicting command pair', async () => {
    const catalog = JSON.parse(
        await readFile(resolve(testDirectory, '..', 'commands.json'), 'utf8'),
    );
    const commands = catalog.commands.map((command) => ({
        ...command,
        available: command.enabled,
        run: null,
    }));
    const selected = new Set(compatibleCommandIds(commands));
    assert.ok(selected.size > 1);
    for (const command of commands.filter(({ id }) => selected.has(id))) {
        assert.equal(
            command.conflictsWith.some((id) => selected.has(id)),
            false,
            `${command.id} conflicts with its bulk selection`,
        );
    }
});
