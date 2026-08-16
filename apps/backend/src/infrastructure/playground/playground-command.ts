import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { z } from 'zod';

import { resolveMigrationsFolder } from '../database/migrations-folder';
import { loadPlaygroundEnvironment } from './playground-environment';
import { runPlaygroundLifecycle } from './playground-lifecycle';

const localEnvironmentFile = new URL(
    '../../../../../.env.local',
    import.meta.url,
);

if (existsSync(localEnvironmentFile)) {
    loadEnvFile(localEnvironmentFile);
}

const mode = z.enum(['provision', 'reset']).parse(process.argv[2]);
const environment = loadPlaygroundEnvironment();
const result = await runPlaygroundLifecycle({
    environment,
    migrationsFolder: resolveMigrationsFolder(import.meta.url),
    mode,
});

console.log(
    `${result.reset ? 'Reset' : result.created ? 'Created' : 'Reused'} Mastra playground database ${result.databaseName}; migrations and synthetic fixtures are current.`,
);
