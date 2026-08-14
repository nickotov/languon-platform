import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');
const configPath = join(repositoryRoot, 'agent-browser.json');
const cliPath = join(
    repositoryRoot,
    'node_modules',
    'agent-browser',
    'bin',
    'agent-browser.js',
);
const sessionDirectory = join(tmpdir(), 'languon-agent-browser-sessions');
const securityArguments = [
    '--allowed-domains',
    'localhost,127.0.0.1',
    '--content-boundaries',
    '--max-output',
    '30000',
];

const taskPattern = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const ownedSessionPattern =
    /^languon-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?-[a-f0-9]{32}$/;
const localHosts = new Set(['localhost', '127.0.0.1']);
const selectorCommands = new Set([
    'check',
    'click',
    'dblclick',
    'focus',
    'hover',
    'scrollintoview',
    'uncheck',
]);
const findLocators = new Set([
    'alt',
    'first',
    'label',
    'last',
    'placeholder',
    'role',
    'testid',
    'text',
    'title',
]);

function fail(message) {
    throw new Error(message);
}

function normalizedInput(input) {
    const values = [...input];
    if (values[0] === '--') values.shift();
    return values;
}

function markerPath(session, directory = sessionDirectory) {
    if (!ownedSessionPattern.test(session)) {
        fail('session is not a wrapper-owned Languon browser session');
    }
    return join(directory, `${session}.json`);
}

export function createOwnedSession(
    task,
    nonce = randomBytes(16).toString('hex'),
) {
    if (!taskPattern.test(task)) {
        fail('task slug must be a 1-48 character lowercase kebab-case name');
    }
    if (!/^[a-f0-9]{32}$/.test(nonce))
        fail('session nonce must contain 32 lowercase hex characters');
    return `languon-${task}-${nonce}`;
}

export function registerOwnedSession(session, directory = sessionDirectory) {
    mkdirSync(directory, { mode: 0o700, recursive: true });
    writeFileSync(
        markerPath(session, directory),
        `${JSON.stringify({ createdAt: new Date().toISOString(), session })}\n`,
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
}

export function isOwnedSession(session, directory = sessionDirectory) {
    try {
        const marker = JSON.parse(
            readFileSync(markerPath(session, directory), 'utf8'),
        );
        return marker.session === session;
    } catch {
        return false;
    }
}

export function removeOwnedSession(session, directory = sessionDirectory) {
    try {
        unlinkSync(markerPath(session, directory));
    } catch (error) {
        if (!error || typeof error !== 'object' || error.code !== 'ENOENT')
            throw error;
    }
}

function requireCount(command, values, minimum, maximum = minimum) {
    if (values.length < minimum || values.length > maximum) {
        fail(
            `${command} expects ${minimum === maximum ? minimum : `${minimum}-${maximum}`} argument(s)`,
        );
    }
}

function validateOpen(values) {
    requireCount('open', values, 1);

    let url;
    try {
        url = new URL(values[0]);
    } catch {
        fail('open requires an absolute local http(s) URL');
    }

    if (
        !url ||
        !['http:', 'https:'].includes(url.protocol) ||
        !localHosts.has(url.hostname) ||
        url.username ||
        url.password
    ) {
        fail(
            'browser verification requires a credential-free localhost or 127.0.0.1 URL',
        );
    }
}

function validateSnapshot(values) {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (['-i', '--interactive', '-c', '--compact'].includes(value)) {
            continue;
        }
        if (['-d', '--depth'].includes(value)) {
            const depth = values[index + 1];
            if (!depth || !/^\d+$/.test(depth))
                fail('snapshot depth must be a non-negative integer');
            index += 1;
            continue;
        }
        if (['-s', '--selector'].includes(value)) {
            if (!values[index + 1] || values[index + 1].startsWith('-')) {
                fail('snapshot selector requires a non-option value');
            }
            index += 1;
            continue;
        }
        fail(`unsupported snapshot option: ${value}`);
    }
}

function validateViewport(values) {
    requireCount('set viewport', values, 3);
    if (
        values[0] !== 'viewport' ||
        !values
            .slice(1)
            .every((value) => /^\d+$/.test(value) && Number(value) > 0)
    ) {
        fail('only positive numeric set viewport <width> <height> is allowed');
    }
}

function validateNetwork(values) {
    if (values[0] !== 'requests')
        fail('only network requests inspection is allowed');

    for (let index = 1; index < values.length; index += 1) {
        const value = values[index];
        if (value === '--clear') continue;
        if (
            ['--filter', '--type', '--method', '--status'].includes(value) &&
            values[index + 1] &&
            !values[index + 1].startsWith('-')
        ) {
            index += 1;
            continue;
        }
        fail(`unsupported network requests option: ${value}`);
    }
}

function rejectOptionInjection(command, values) {
    if (values.some((value) => value.startsWith('-'))) {
        fail(`${command} values cannot contain command-line options`);
    }
}

function validateFind(values) {
    if (values.length < 3)
        fail('find requires a locator, value, and safe action');
    if (!findLocators.has(values[0])) fail('unsupported find locator');
    if (values[0].startsWith('-') || values[1].startsWith('-')) {
        fail('find locator and value cannot contain command-line options');
    }
    if (!['click', 'fill', 'check', 'hover', 'text'].includes(values[2])) {
        fail('unsupported find action');
    }

    for (let index = 3; index < values.length; index += 1) {
        const value = values[index];
        if (value === '--exact') continue;
        if (
            value === '--name' &&
            values[index + 1] &&
            !values[index + 1].startsWith('-')
        ) {
            index += 1;
            continue;
        }
        if (value.startsWith('-')) fail(`unsupported find option: ${value}`);
    }
}

function validateCommand(command, values) {
    if (selectorCommands.has(command)) {
        rejectOptionInjection(command, values);
        return requireCount(command, values, 1);
    }

    switch (command) {
        case 'open':
            return validateOpen(values);
        case 'snapshot':
            return validateSnapshot(values);
        case 'fill':
        case 'type':
            rejectOptionInjection(command, values);
            return requireCount(command, values, 2);
        case 'press':
            rejectOptionInjection(command, values);
            return requireCount(command, values, 1);
        case 'select':
            rejectOptionInjection(command, values);
            return requireCount(command, values, 2, Number.POSITIVE_INFINITY);
        case 'scroll':
            requireCount(command, values, 1, 2);
            if (!['up', 'down', 'left', 'right'].includes(values[0]))
                fail('unsupported scroll direction');
            if (values[1] && !/^\d+$/.test(values[1]))
                fail('scroll distance must be a non-negative integer');
            return;
        case 'wait':
            rejectOptionInjection(command, values);
            return requireCount(command, values, 1);
        case 'screenshot':
            if (
                !values.every((value) =>
                    ['--full', '--annotate'].includes(value),
                )
            ) {
                fail('screenshots must use the tool-generated temporary path');
            }
            return;
        case 'set':
            return validateViewport(values);
        case 'network':
            return validateNetwork(values);
        case 'get':
            rejectOptionInjection(command, values);
            if (
                ![
                    'text',
                    'html',
                    'value',
                    'attr',
                    'title',
                    'url',
                    'count',
                    'box',
                    'styles',
                ].includes(values[0])
            ) {
                fail('unsupported get operation');
            }
            return requireCount(
                command,
                values,
                values[0] === 'title' || values[0] === 'url' ? 1 : 2,
                values[0] === 'attr'
                    ? 3
                    : values[0] === 'title' || values[0] === 'url'
                      ? 1
                      : 2,
            );
        case 'is':
            rejectOptionInjection(command, values);
            if (!['visible', 'enabled', 'checked'].includes(values[0]))
                fail('unsupported is operation');
            return requireCount(command, values, 2);
        case 'find':
            return validateFind(values);
        case 'back':
        case 'close':
        case 'console':
        case 'errors':
        case 'forward':
        case 'reload':
            return requireCount(command, values, 0);
        default:
            fail(`unsupported browser command: ${command}`);
    }
}

export function buildAgentBrowserArgs(
    input,
    { ownsSession = isOwnedSession } = {},
) {
    const values = normalizedInput(input);
    if (values[0] === '--doctor') {
        requireCount('--doctor', values, 1);
        return ['--config', configPath, 'doctor', '--offline'];
    }
    if (values[0] === '--install') {
        const installValues = values.slice(1);
        if (installValues[0] === '--') installValues.shift();
        if (
            installValues.length > 1 ||
            (installValues.length === 1 && installValues[0] !== '--with-deps')
        ) {
            fail('browser install accepts only the optional --with-deps flag');
        }
        return ['--config', configPath, 'install', ...installValues];
    }
    if (values[0] !== '--session' || !values[1]) {
        fail(
            'usage: pnpm browser -- start <task-slug> <local-url>, then use the returned --session handle',
        );
    }

    const session = values[1];
    if (!ownedSessionPattern.test(session) || !ownsSession(session)) {
        fail('session is not an active wrapper-owned Languon browser session');
    }
    const command = values[2];
    if (!command) fail('a browser command is required');
    const commandValues = values.slice(3);
    validateCommand(command, commandValues);

    return [
        '--config',
        configPath,
        ...securityArguments,
        '--session',
        session,
        command,
        ...commandValues,
    ];
}

export function sanitizedEnvironment(environment) {
    return Object.fromEntries(
        Object.entries(environment).filter(([key]) => {
            const normalizedKey = key.toUpperCase();
            return (
                !normalizedKey.startsWith('AGENT_BROWSER_') &&
                ![
                    'ALL_PROXY',
                    'HTTP_PROXY',
                    'HTTPS_PROXY',
                    'NO_PROXY',
                ].includes(normalizedKey)
            );
        }),
    );
}

export function shouldRemoveOwnedSession(command, status) {
    return command === 'close' && status === 0;
}

function runAgentBrowser(arguments_) {
    if (!existsSync(cliPath))
        fail('agent-browser is not installed; run pnpm install first');
    const result = spawnSync(process.execPath, [cliPath, ...arguments_], {
        cwd: repositoryRoot,
        env: sanitizedEnvironment(process.env),
        stdio: 'inherit',
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
}

function startSession(values) {
    requireCount('start', values, 3);
    const task = values[1];
    validateOpen([values[2]]);
    const session = createOwnedSession(task);
    registerOwnedSession(session);

    let status;
    try {
        status = runAgentBrowser([
            '--config',
            configPath,
            ...securityArguments,
            '--session',
            session,
            'open',
            values[2],
        ]);
    } catch (error) {
        removeOwnedSession(session);
        throw error;
    }
    if (status !== 0) {
        removeOwnedSession(session);
        return status;
    }

    console.log(`Languon browser session: ${session}`);
    return 0;
}

function main() {
    const values = normalizedInput(process.argv.slice(2));
    if (values[0] === 'start') {
        process.exitCode = startSession(values);
        return;
    }

    const session = values[0] === '--session' ? values[1] : undefined;
    const command = values[0] === '--session' ? values[2] : undefined;
    const status = runAgentBrowser(buildAgentBrowserArgs(values));
    if (session && shouldRemoveOwnedSession(command, status)) {
        removeOwnedSession(session);
    }
    process.exitCode = status;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
