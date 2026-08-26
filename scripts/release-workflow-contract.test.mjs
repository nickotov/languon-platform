import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const WORKFLOW_FILES = [
    '.github/workflows/reusable-verify-build.yml',
    '.github/workflows/stage.yml',
    '.github/workflows/release.yml',
    '.github/workflows/deploy-production.yml',
];

const workflows = Object.fromEntries(
    await Promise.all(
        WORKFLOW_FILES.map(async (file) => [
            file,
            await readFile(file, 'utf8'),
        ]),
    ),
);

function workflow(name) {
    return workflows[`.github/workflows/${name}`];
}

function runBodies(source) {
    const lines = source.split('\n');
    const bodies = [];
    for (let index = 0; index < lines.length; index += 1) {
        const match = /^(\s*)run:\s*(.*)$/.exec(lines[index]);
        if (!match) continue;
        const indent = match[1].length;
        const body = [match[2]];
        while (index + 1 < lines.length) {
            const next = lines[index + 1];
            if (next.trim() && next.search(/\S/) <= indent) break;
            body.push(next);
            index += 1;
        }
        bodies.push(body.join('\n'));
    }
    return bodies;
}

test('only explicit manual and published-release entry points exist', () => {
    const reusable = workflow('reusable-verify-build.yml');
    const stage = workflow('stage.yml');
    const release = workflow('release.yml');
    const production = workflow('deploy-production.yml');

    assert.match(reusable, /workflow_call:/);
    assert.match(stage, /workflow_dispatch:/);
    assert.match(production, /workflow_dispatch:/);
    assert.match(release, /release:\n\s+types: \[published\]/);
    for (const source of Object.values(workflows)) {
        assert.doesNotMatch(
            source,
            /^ {4}(push|pull_request|pull_request_target|schedule):/m,
        );
    }
});

test('all third-party actions are pinned to full commit SHAs', () => {
    for (const [file, source] of Object.entries(workflows)) {
        for (const match of source.matchAll(/uses:\s*([^\s#]+)/g)) {
            const reference = match[1];
            if (reference.startsWith('./')) continue;
            assert.match(reference, /@[a-f0-9]{40}$/, `${file}: ${reference}`);
        }
    }
});

test('untrusted event and dispatch values enter shell only through environment variables', () => {
    for (const [file, source] of Object.entries(workflows)) {
        for (const body of runBodies(source)) {
            assert.doesNotMatch(
                body,
                /\$\{\{\s*(?:inputs|github\.event)/,
                `${file}: ${body}`,
            );
        }
    }
});

test('reusable verification builds all images and emits exact digests after checks', () => {
    const source = workflow('reusable-verify-build.yml');
    for (const check of [
        'pnpm install --frozen-lockfile',
        'pnpm format:check',
        'pnpm lint',
        'pnpm typecheck',
        'pnpm test',
        'pnpm db:check',
        'pnpm build',
    ]) {
        assert.match(
            source,
            new RegExp(check.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        );
    }
    for (const service of ['backend', 'web', 'admin', 'migrator']) {
        assert.match(source, new RegExp(`prod\\.${service}\\.Dockerfile`));
        assert.match(
            source,
            new RegExp(
                `${service}=\\$IMAGE_PREFIX/${service}@\\$[A-Z_]+DIGEST`,
            ),
        );
    }
    assert.match(source, /provenance: mode=max/);
    assert.match(source, /sbom: true/);
    assert.match(source, /actions\/attest@[a-f0-9]{40}/);
    assert.match(source, /migration-classification\.mjs/);
    assert.doesNotMatch(source, /--migration-compatibility expand/);
    assert.match(source, /--dictionary-job-phase "expand"/);
    for (const capability of [
        'worker-processable',
        'api-readable',
        'api-cancellable',
        'api-discardable',
        'api-acceptable',
        'web-readable',
    ]) {
        assert.match(source, new RegExp(`--dictionary-job-${capability} ""`));
    }
    assert.doesNotMatch(
        source,
        /--dictionary-job-(?:worker-processable|api-readable|api-cancellable|api-discardable|api-acceptable|web-readable) "[^"]+"/,
    );
    assert.doesNotMatch(source, /--dictionary-job-api-enqueued/);
    assert.match(source, /--dictionary-job-retire-formats ""/);
    for (const [flag, value] of [
        ['max-input-tokens-per-attempt', '262144'],
        ['max-output-tokens-per-attempt', '40960'],
        ['input-cost-micros-per-million-tokens', '1000000'],
        ['output-cost-micros-per-million-tokens', '4000000'],
        ['max-cost-micros-per-attempt', '500000'],
    ]) {
        assert.match(source, new RegExp(`--dictionary-job-${flag} "${value}"`));
    }
});

test('stage selects current stage head, serializes, then deploys the same manifest', () => {
    const source = workflow('stage.yml');
    assert.match(source, /stage:refs\/remotes\/origin\/stage/);
    assert.match(
        source,
        /uses: \.\/\.github\/workflows\/reusable-verify-build\.yml/,
    );
    assert.match(source, /group: deploy-stage/);
    assert.match(source, /cancel-in-progress: false/);
    assert.match(source, /environment: staging/);
    assert.match(source, /release-manifest\.mjs validate/);
    assert.match(source, /--environment stage/);
});

test('release validates stable main ancestry, publishes build-ready manifest, and never deploys', () => {
    const source = workflow('release.yml');
    assert.match(source, /!github\.event\.release\.prerelease/);
    assert.match(source, /release-ref\.mjs release/);
    assert.match(source, /origin main:refs\/remotes\/origin\/main/);
    assert.match(source, /gh release upload/);
    assert.doesNotMatch(source, /deploy-release|--environment production/);
});

test('production is a serialized protected manual promotion without rebuilding', () => {
    const source = workflow('deploy-production.yml');
    assert.match(source, /environment: production/);
    assert.match(source, /group: deploy-production/);
    assert.match(source, /cancel-in-progress: false/);
    assert.match(source, /gh run view/);
    assert.match(source, /gh attestation verify/);
    assert.match(source, /gh run download/);
    assert.match(source, /cmp --silent/);
    assert.match(source, /--expected-image-prefix/);
    assert.match(source, /\.conclusion\)" = success/);
    assert.match(source, /release-manifest\.mjs validate/);
    assert.match(source, /--environment production/);
    assert.doesNotMatch(source, /build-push-action|reusable-verify-build/);
});

test('deployment uses pinned SSH host identity and the private network action', () => {
    for (const name of ['stage.yml', 'deploy-production.yml']) {
        const source = workflow(name);
        assert.match(source, /DEPLOY_SSH_HOST_KEY/);
        assert.match(source, /DEPLOY_SSH_PRIVATE_KEY/);
        assert.match(source, /known_hosts/);
        assert.match(source, /tailscale\/github-action@[a-f0-9]{40}/);
        assert.doesNotMatch(
            source,
            /StrictHostKeyChecking=no|UserKnownHostsFile=\/dev\/null/,
        );
    }
    assert.match(workflow('stage.yml'), /tags: tag:ci-stage/);
    assert.match(workflow('deploy-production.yml'), /tags: tag:ci-production/);
});

test('remote deployment bundles include the production backup gate', () => {
    for (const name of ['stage.yml', 'deploy-production.yml']) {
        const source = workflow(name);
        assert.match(source, /infra\/backup\/\./);
        assert.match(source, /remote_dir\/infra\/backup/);
    }
});
