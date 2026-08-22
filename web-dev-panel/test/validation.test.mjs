import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeCustomSections } from '../public/custom-sections.js';
import {
    validateBatchBody,
    validateEmptyBody,
    validateStopBody,
    validateStopSelectedBody,
} from '../src/http-validation.mjs';

const revision = `sha256:${'a'.repeat(64)}`;

test('custom-section membership cannot exceed the atomic stop-selected bound', () => {
    const commandIds = Array.from(
        { length: 64 },
        (_, index) => `command:${index}`,
    );
    const document = {
        schema: 'languon.web-dev-panel.custom-sections',
        version: 1,
        sections: [
            {
                commandIds,
                id: 'section-123e4567-e89b-42d3-a456-426614174000',
                name: 'Maximum atomic section',
            },
        ],
    };
    assert.doesNotThrow(() => serializeCustomSections(document));
    assert.equal(
        validateStopSelectedBody({
            runs: commandIds.map((commandId, index) => ({
                commandId,
                runId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            })),
        }),
        true,
    );
    assert.throws(
        () =>
            serializeCustomSections({
                ...document,
                sections: [
                    {
                        ...document.sections[0],
                        commandIds: [...commandIds, 'command:64'],
                    },
                ],
            }),
        (error) => error.code === 'too-many-section-members',
    );
});

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
    assert.equal(
        validateStopSelectedBody({
            runs: [
                {
                    commandId: 'lint',
                    runId: '123e4567-e89b-12d3-a456-426614174000',
                },
            ],
        }),
        true,
    );
    assert.equal(validateStopSelectedBody({ runs: [] }), false);
    assert.equal(
        validateStopSelectedBody({
            runs: Array.from({ length: 64 }, () => ({
                commandId: 'lint',
                runId: '123e4567-e89b-12d3-a456-426614174000',
            })),
        }),
        true,
    );
    assert.equal(
        validateStopSelectedBody({
            runs: Array.from({ length: 65 }, () => ({
                commandId: 'lint',
                runId: '123e4567-e89b-12d3-a456-426614174000',
            })),
        }),
        false,
    );
    assert.equal(
        validateStopSelectedBody({
            runs: [
                {
                    commandId: 'lint',
                    runId: '123e4567-e89b-12d3-a456-426614174000',
                    signal: 'SIGKILL',
                },
            ],
        }),
        false,
    );
    assert.equal(
        validateStopSelectedBody({
            runs: [
                {
                    commandId: 'Lint',
                    runId: '123e4567-e89b-12d3-a456-426614174000',
                },
            ],
        }),
        false,
    );
    assert.equal(validateEmptyBody({}), true);
    assert.equal(validateEmptyBody({ inherited: false }), false);
});
