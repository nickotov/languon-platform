import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { z } from 'zod';

import { databaseSchema } from '../infrastructure/database/schema';
import { loadPlaygroundEnvironment } from '../infrastructure/playground/playground-environment';
import { DevelopmentVerificationService } from '../modules/development-harness/application/development-verification-service';
import { developmentHarnessFixture } from '../modules/development-harness/infrastructure/development-fixture';
import { DrizzleDevelopmentPrincipalReader } from '../modules/development-harness/infrastructure/persistence/drizzle-development-principal-reader';
import { createCanonicalMastra } from './composition';
import { enforceDevelopmentHarnessProcessPolicy } from './development-server-policy';

const HarnessFlagSchema = z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true');

const includeDevelopmentHarness = HarnessFlagSchema.parse(
    process.env.MASTRA_DEV_HARNESS,
);
if (includeDevelopmentHarness) enforceDevelopmentHarnessProcessPolicy();

function createDevelopmentHarnessOptions() {
    if (!includeDevelopmentHarness) return undefined;

    const environment = loadPlaygroundEnvironment();
    const sql = createPostgresClient({ databaseUrl: environment.databaseUrl });
    const database = createDrizzleDatabase(sql, databaseSchema);

    return {
        ...(environment.deepSeekApiKey
            ? { deepSeekApiKey: environment.deepSeekApiKey }
            : {}),
        fallbackModelId: environment.fallbackModelId,
        modelId: environment.modelId,
        service: new DevelopmentVerificationService(
            new DrizzleDevelopmentPrincipalReader(database),
            developmentHarnessFixture.principalId,
        ),
    };
}

export const mastra = createCanonicalMastra({
    ...(includeDevelopmentHarness
        ? { developmentHarness: createDevelopmentHarnessOptions()! }
        : {}),
});
