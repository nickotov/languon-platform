import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMigrationClassification } from './migration-classification.mjs';

const journal = { entries: [{ tag: '0001_latest' }] };
const reviewedMigrationsSha256 = 'a'.repeat(64);

test('returns a reviewed deploy-safe migration classification', () => {
    assert.equal(
        validateMigrationClassification(
            {
                schemaVersion: 1,
                reviewedThrough: '0001_latest',
                reviewedMigrationsSha256,
                compatibility: 'expand',
                rationale: 'This remains compatible with both running slots.',
            },
            journal,
            reviewedMigrationsSha256,
        ),
        'expand',
    );
});

test('rejects stale and contract migration classifications', () => {
    const base = {
        schemaVersion: 1,
        reviewedThrough: '0000_old',
        reviewedMigrationsSha256,
        compatibility: 'expand',
        rationale: 'This remains compatible with both running slots.',
    };
    assert.throws(
        () =>
            validateMigrationClassification(
                base,
                journal,
                reviewedMigrationsSha256,
            ),
        /stale/,
    );
    assert.throws(
        () =>
            validateMigrationClassification(
                {
                    ...base,
                    reviewedThrough: '0001_latest',
                    compatibility: 'contract',
                },
                journal,
                reviewedMigrationsSha256,
            ),
        /cannot precede/,
    );
    assert.throws(
        () =>
            validateMigrationClassification(
                { ...base, reviewedThrough: '0001_latest' },
                journal,
                'b'.repeat(64),
            ),
        /reviewed migration content/,
    );
});
