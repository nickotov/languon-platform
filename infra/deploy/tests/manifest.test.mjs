import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReleaseManifest } from '../lib/manifest.mjs';

const digest = 'a'.repeat(64);
const valid = {
    schemaVersion: 1,
    identity: 'stage-abc',
    version: null,
    sourceSha: 'b'.repeat(40),
    verified: true,
    workflowRun: 42,
    createdAt: '2026-08-18T10:00:00.000Z',
    images: Object.fromEntries(
        ['backend', 'web', 'admin', 'migrator'].map((name) => [
            name,
            `ghcr.io/nick/languon-${name}@sha256:${digest}`,
        ]),
    ),
    migration: { compatibility: 'expand', ledger: 'drizzle' },
};

test('accepts an exact build-ready immutable manifest', () => {
    assert.deepEqual(validateReleaseManifest(valid), valid);
});

test('rejects mutable or incomplete image sets', () => {
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                images: { ...valid.images, web: 'ghcr.io/nick/web:latest' },
            }),
        /sha256 digest/,
    );
    const { admin: _, ...images } = valid.images;
    assert.throws(
        () => validateReleaseManifest({ ...valid, images }),
        /exactly/,
    );
});

test('rejects destructive migration compatibility', () => {
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                migration: { compatibility: 'contract', ledger: 'drizzle' },
            }),
        /Contract\/destructive/,
    );
});

test('permits local digest registry only with an explicit rehearsal option', () => {
    const images = Object.fromEntries(
        Object.keys(valid.images).map((name) => [
            name,
            `localhost:5500/languon/${name}@sha256:${digest}`,
        ]),
    );
    assert.throws(
        () => validateReleaseManifest({ ...valid, images }),
        /permitted/,
    );
    assert.equal(
        validateReleaseManifest(
            { ...valid, images },
            { allowLocalRegistry: true },
        ).images.web,
        images.web,
    );
});
