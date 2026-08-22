import assert from 'node:assert/strict';
import test from 'node:test';

import {
    validateBatchBody,
    validateEmptyBody,
    validateStopBody,
} from '../src/http-validation.mjs';

const revision = `sha256:${'a'.repeat(64)}`;

test('accepts only closed start, stop, and empty request objects', () => {
    assert.equal(
        validateBatchBody({
            selections: [{ id: 'lint', sourceRevision: revision }],
        }),
        true,
    );
    assert.equal(
        validateBatchBody({
            extra: true,
            selections: [{ id: 'lint', sourceRevision: revision }],
        }),
        false,
    );
    assert.equal(
        validateStopBody({
            commandId: 'lint',
            runId: '123e4567-e89b-12d3-a456-426614174000',
        }),
        true,
    );
    assert.equal(validateStopBody({ commandId: 'lint' }), false);
    assert.equal(validateEmptyBody({}), true);
    assert.equal(validateEmptyBody({ inherited: false }), false);
});
