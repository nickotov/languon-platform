import assert from 'node:assert/strict';
import {
    mkdtemp,
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { test } from 'node:test';
import { createFeature } from './create-feature.mjs';

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'languon-feature-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, '.agent/templates'), { recursive: true });
    await mkdir(join(root, '.agent/features'), { recursive: true });
    for (const name of [
        'FEATURE.md',
        'EXEC_PLAN.md',
        'EVIDENCE.md',
        'REVIEW.md',
    ]) {
        await writeFile(
            join(root, '.agent/templates', name),
            '{{FEATURE_NAME}} {{FEATURE_SLUG}} {{FEATURE_FOLDER}} {{DATE}}',
        );
    }
    return root;
}

test('creates four artifacts with automatic prefix and stable logical slug', async (t) => {
    const root = await fixture(t);
    const target = await createFeature(root, ['--', 'sample-feature']);
    assert.equal(basename(target), '001-sample-feature');
    assert.equal((await readdir(target)).length, 4);
    assert.match(
        await readFile(join(target, 'FEATURE.md'), 'utf8'),
        /^Sample Feature sample-feature 001-sample-feature \d{4}-\d{2}-\d{2}$/,
    );
});
test('uses max counter, keeps gaps, rejects duplicate slugs and supplied prefixes', async (t) => {
    const root = await fixture(t);
    await mkdir(join(root, '.agent/features/007-existing'));
    await mkdir(join(root, '.agent/features/002-older'));
    await assert.rejects(createFeature(root, ['existing']), /already exists/);
    await assert.rejects(
        createFeature(root, ['008-next']),
        /omit the numeric prefix/,
    );
    await assert.rejects(createFeature(root, ['../escape']), /Usage/);
    assert.equal(
        basename(await createFeature(root, ['next', 'Custom title'])),
        '008-next',
    );
});
test('recognizes legacy duplicates and fails safely on a creation lock', async (t) => {
    const root = await fixture(t);
    await mkdir(join(root, '.agent/features/legacy'));
    await assert.rejects(createFeature(root, ['legacy']), /already exists/);
    await mkdir(join(root, '.agent/features/.create-feature.lock'));
    await assert.rejects(createFeature(root, ['new']), /in progress/);
    assert.deepEqual((await readdir(join(root, '.agent/features'))).sort(), [
        '.create-feature.lock',
        'legacy',
    ]);
});
test('missing templates create no partial folder or lock', async (t) => {
    const root = await fixture(t);
    await rm(join(root, '.agent/templates/REVIEW.md'));
    await assert.rejects(createFeature(root, ['new']), /ENOENT/);
    assert.deepEqual(await readdir(join(root, '.agent/features')), []);
});
test('concurrent requests never allocate the same counter', async (t) => {
    const root = await fixture(t);
    const results = await Promise.allSettled([
        createFeature(root, ['alpha']),
        createFeature(root, ['beta']),
    ]);
    const successes = results.filter((result) => result.status === 'fulfilled');
    assert.ok(successes.length >= 1);
    const folders = await readdir(join(root, '.agent/features'));
    assert.equal(
        new Set(folders.map((name) => name.split('-')[0])).size,
        folders.length,
    );
    for (const result of results)
        if (result.status === 'rejected')
            assert.match(result.reason.message, /in progress/);
    assert.ok(!folders.includes('.create-feature.lock'));
});
