import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    buildAgentBrowserArgs,
    createOwnedSession,
    isOwnedSession,
    registerOwnedSession,
    removeOwnedSession,
    sanitizedEnvironment,
    shouldRemoveOwnedSession,
} from './agent-browser.mjs';

const ownedSession = createOwnedSession('saved-vocabulary', 'a'.repeat(32));
const buildOwnedArgs = (values) =>
    buildAgentBrowserArgs(values, {
        ownsSession: (session) => session === ownedSession,
    });

test('builds safe local browser commands with the explicit project config', () => {
    const args = buildOwnedArgs([
        '--session',
        ownedSession,
        'open',
        'http://127.0.0.1:3333/login',
    ]);

    assert.deepEqual(args.slice(-4), [
        '--session',
        ownedSession,
        'open',
        'http://127.0.0.1:3333/login',
    ]);
    assert.equal(args[0], '--config');
    assert.match(args[1], /agent-browser\.json$/);
    assert.ok(args.includes('--allowed-domains'));
    assert.ok(args.includes('--content-boundaries'));
    assert.ok(args.includes('--max-output'));
});

test('rejects external origins and unsafe browser capabilities', () => {
    assert.throws(
        () =>
            buildAgentBrowserArgs(
                ['--session', ownedSession, 'open', 'https://example.com'],
                { ownsSession: () => true },
            ),
        /credential-free localhost/,
    );
    assert.throws(
        () =>
            buildAgentBrowserArgs(
                [
                    '--session',
                    ownedSession,
                    'open',
                    'http://user:secret@localhost:3333',
                ],
                { ownsSession: () => true },
            ),
        /credential-free localhost/,
    );

    for (const command of [
        'eval',
        'upload',
        'download',
        'auth',
        'state',
        'chat',
        'batch',
    ]) {
        assert.throws(
            () => buildOwnedArgs(['--session', ownedSession, command, 'value']),
            /unsupported browser command/,
        );
    }

    assert.throws(
        () =>
            buildOwnedArgs([
                '--session',
                ownedSession,
                'fill',
                '@e1',
                '--profile=Default',
            ]),
        /cannot contain command-line options/,
    );
    assert.throws(
        () =>
            buildOwnedArgs([
                '--session',
                ownedSession,
                'find',
                'role',
                'button',
                'click',
                '--provider',
                'browserless',
            ]),
        /unsupported find option/,
    );
    assert.throws(
        () =>
            buildOwnedArgs([
                '--session',
                ownedSession,
                'find',
                'role',
                '--profile=Default',
                'click',
            ]),
        /locator and value cannot contain/,
    );
    assert.throws(
        () =>
            buildOwnedArgs([
                '--session',
                ownedSession,
                'find',
                'unknown',
                'value',
                'click',
            ]),
        /unsupported find locator/,
    );
});

test('requires an isolated, bounded task session', () => {
    assert.throws(
        () => buildAgentBrowserArgs(['open', 'http://localhost:3333']),
        /usage/,
    );
    assert.throws(
        () => buildAgentBrowserArgs(['--session', '../../shared', 'close']),
        /wrapper-owned/,
    );
    assert.throws(
        () => buildAgentBrowserArgs(['--session', 'default', 'get', 'url']),
        /wrapper-owned/,
    );
    assert.throws(
        () =>
            buildAgentBrowserArgs([
                '--session',
                createOwnedSession('unregistered', 'b'.repeat(32)),
                'get',
                'url',
            ]),
        /active wrapper-owned/,
    );
    assert.throws(
        () => buildOwnedArgs(['--session', ownedSession, 'close', '--all']),
        /expects 0 argument/,
    );
});

test('registers random wrapper-owned sessions and removes ownership on close', () => {
    const directory = mkdtempSync(join(tmpdir(), 'languon-browser-test-'));
    const session = createOwnedSession('concurrent-check', 'c'.repeat(32));

    try {
        assert.equal(isOwnedSession(session, directory), false);
        registerOwnedSession(session, directory);
        assert.equal(isOwnedSession(session, directory), true);
        assert.throws(() => registerOwnedSession(session, directory), /EEXIST/);
        removeOwnedSession(session, directory);
        assert.equal(isOwnedSession(session, directory), false);
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

test('strips user agent-browser and proxy overrides from the child environment', () => {
    const environment = sanitizedEnvironment({
        AGENT_BROWSER_CONFIG: '/tmp/untrusted.json',
        AGENT_BROWSER_PROFILE: 'Default',
        agent_browser_plugins: 'untrusted-plugin',
        Agent_Browser_Init_Scripts: '/tmp/untrusted.js',
        HTTPS_PROXY: 'https://proxy.example',
        PATH: '/usr/bin',
        TASK_VALUE: 'kept',
    });

    assert.deepEqual(environment, { PATH: '/usr/bin', TASK_VALUE: 'kept' });
});

test('doctor uses the explicit project config and retains the live launch probe', () => {
    const args = buildAgentBrowserArgs(['--doctor']);

    assert.equal(args[0], '--config');
    assert.match(args[1], /agent-browser\.json$/);
    assert.deepEqual(args.slice(2), ['doctor', '--offline']);
});

test('install uses the explicit project config and only allows system dependencies', () => {
    const args = buildAgentBrowserArgs(['--install', '--', '--with-deps']);

    assert.equal(args[0], '--config');
    assert.match(args[1], /agent-browser\.json$/);
    assert.deepEqual(args.slice(2), ['install', '--with-deps']);
    assert.throws(
        () => buildAgentBrowserArgs(['--install', '--provider', 'browserless']),
        /accepts only/,
    );
});

test('only a successful close releases wrapper session ownership', () => {
    assert.equal(shouldRemoveOwnedSession('close', 0), true);
    assert.equal(shouldRemoveOwnedSession('close', 1), false);
    assert.equal(shouldRemoveOwnedSession('snapshot', 0), false);
});
