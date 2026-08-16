import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveMigrationsFolder } from '../../../../src/infrastructure/database/migrations-folder';

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { force: true, recursive: true });
    }
});

describe('migration folder resolution', () => {
    it.each([
        {
            entry: ['src', 'infrastructure', 'database', 'migrate-command.ts'],
            migrations: ['drizzle'],
            name: 'source entry point',
        },
        {
            entry: [
                'dist',
                'infrastructure',
                'playground',
                'playground-command.js',
            ],
            migrations: ['dist', 'drizzle'],
            name: 'built entry point',
        },
    ])(
        'anchors migrations to the $name instead of a shared chunk',
        (layout) => {
            const backend = mkdtempSync(join(tmpdir(), 'languon-backend-'));
            temporaryDirectories.push(backend);
            const migrations = join(backend, ...layout.migrations);
            mkdirSync(migrations, { recursive: true });

            expect(
                resolveMigrationsFolder(
                    pathToFileURL(join(backend, ...layout.entry)),
                ),
            ).toBe(migrations);
        },
    );
});
