import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { runCommand } from '../lib/runner.mjs';

// @user-flow-revision release-deployment-platform sha256:626f48fafb9cd546

async function rehearsal(command) {
    return await new Promise((resolve, reject) => {
        const child = spawn(
            'node',
            ['infra/deploy/local-rehearsal.mjs', command],
            {
                stdio: 'inherit',
            },
        );
        child.on('error', reject);
        child.on('close', resolve);
    });
}

async function assertRehearsalRemoved() {
    for (const [kind, args] of [
        ['container', ['ls', '--all', '--format', '{{.Names}}']],
        ['network', ['ls', '--format', '{{.Name}}']],
        ['volume', ['ls', '--format', '{{.Name}}']],
    ]) {
        const { stdout } = await runCommand('docker', [kind, ...args], {
            capture: true,
        });
        assert.doesNotMatch(stdout, /languon-local-stage/);
    }
}

// @user-flow release-deployment-platform/local-deploy-verify-rollback
test(
    'disposable local deployment journey',
    { skip: process.env.LANGUON_DEPLOY_E2E !== 'true', timeout: 30 * 60_000 },
    async () => {
        try {
            assert.equal(await rehearsal('journey'), 0);
        } finally {
            assert.equal(await rehearsal('down'), 0);
            await assertRehearsalRemoved();
        }
    },
);
