import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { dictionaryWorkerLocalEnvironmentFile } from '../../../../src/infrastructure/worker/dictionary-worker-command';

describe('dictionary worker command', () => {
    it('resolves the shared repository local environment file', () => {
        expect(fileURLToPath(dictionaryWorkerLocalEnvironmentFile)).toMatch(
            /\/languon\/\.env\.local$/,
        );
    });
});
