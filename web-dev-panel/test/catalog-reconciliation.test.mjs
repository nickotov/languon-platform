import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileExistingPackageCommand } from '../src/catalog-reconciliation.mjs';
import { packageScriptRevision } from '../src/source-revision.mjs';

function reviewedCommand(script) {
    return {
        batchEligible: true,
        disabledReason: null,
        enabled: true,
        id: 'lint',
        source: {
            revision: packageScriptRevision('lint', script),
            script: 'lint',
            type: 'package-script',
        },
    };
}

test('changed scripts become unavailable before their revision is trusted', () => {
    const reconciled = reconcileExistingPackageCommand(
        reviewedCommand('eslint .'),
        'lint',
        'prettier --write .',
    );
    assert.equal(reconciled.enabled, false);
    assert.equal(reconciled.batchEligible, false);
    assert.match(reconciled.disabledReason, /explicit safety review/u);
    assert.equal(
        reconciled.source.revision,
        packageScriptRevision('lint', 'prettier --write .'),
    );
});

test('unchanged scripts preserve their reviewed safety decision', () => {
    const previous = reviewedCommand('eslint .');
    assert.deepEqual(
        reconcileExistingPackageCommand(previous, 'lint', 'eslint .'),
        previous,
    );
});
