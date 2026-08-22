import { EventEmitter } from 'node:events';
import { watch } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
    documentedCommandRevision,
    packageScriptRevision,
} from './source-revision.mjs';

const catalogKeys = new Set(['commands', 'version']);
const commandKeys = new Set([
    'batchEligible',
    'category',
    'conflictsWith',
    'description',
    'disabledReason',
    'enabled',
    'id',
    'kind',
    'outputProtocol',
    'source',
    'title',
]);
const packageSourceKeys = new Set(['revision', 'script', 'type']);
const documentedSourceKeys = new Set([
    'args',
    'command',
    'cwd',
    'executable',
    'path',
    'revision',
    'type',
]);
const commandIdPattern = /^[a-z0-9](?:[a-z0-9:-]{0,78}[a-z0-9])?$/;
const revisionPattern = /^sha256:[a-f0-9]{64}$/;
const activeStatuses = new Set(['running', 'starting', 'stopping']);

function fail(path, message) {
    throw new Error(`${path}: ${message}`);
}

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype ||
            Object.getPrototypeOf(value) === null)
    );
}

function assertExactKeys(value, keys, path) {
    if (!isPlainObject(value)) fail(path, 'must be an object');
    for (const key of Object.keys(value)) {
        if (!keys.has(key)) fail(path, `unsupported key '${key}'`);
    }
}

function requiredString(value, path, maximum) {
    const hasControlCharacter =
        typeof value === 'string' &&
        [...value].some((character) => {
            const codePoint = character.codePointAt(0);
            return (
                codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
            );
        });
    if (
        typeof value !== 'string' ||
        value.trim() !== value ||
        value.length === 0 ||
        value.length > maximum ||
        hasControlCharacter
    ) {
        fail(path, `must be a trimmed 1-${maximum} character string`);
    }
    return value;
}

function stringArray(value, path, maximumItems = 64) {
    if (!Array.isArray(value) || value.length > maximumItems) {
        fail(path, `must be an array with at most ${maximumItems} items`);
    }
    const result = value.map((item, index) =>
        requiredString(item, `${path}[${index}]`, 512),
    );
    if (new Set(result).size !== result.length) {
        fail(path, 'must not contain duplicate values');
    }
    return result;
}

function validateSource(value, path) {
    if (!isPlainObject(value)) fail(path, 'must be an object');
    const type = requiredString(value.type, `${path}.type`, 32);
    if (type === 'package-script') {
        assertExactKeys(value, packageSourceKeys, path);
        const script = requiredString(value.script, `${path}.script`, 80);
        if (!commandIdPattern.test(script)) {
            fail(`${path}.script`, 'must be a package-script identifier');
        }
        const revision = requiredString(value.revision, `${path}.revision`, 71);
        if (!revisionPattern.test(revision)) {
            fail(`${path}.revision`, 'must be a SHA-256 revision');
        }
        return { revision, script, type };
    }

    if (type !== 'documented-command') {
        fail(`${path}.type`, 'must be package-script or documented-command');
    }
    assertExactKeys(value, documentedSourceKeys, path);
    const source = {
        args: stringArray(value.args, `${path}.args`, 32),
        command: requiredString(value.command, `${path}.command`, 1024),
        cwd: requiredString(value.cwd, `${path}.cwd`, 256),
        executable: requiredString(value.executable, `${path}.executable`, 80),
        path: requiredString(value.path, `${path}.path`, 256),
        revision: requiredString(value.revision, `${path}.revision`, 71),
        type,
    };
    if (
        isAbsolute(source.path) ||
        isAbsolute(source.cwd) ||
        source.path.split(/[\\/]/u).includes('..') ||
        source.cwd.split(/[\\/]/u).includes('..')
    ) {
        fail(path, 'paths must stay repository-relative');
    }
    if (
        /^(?:ba|z|fi|c)?sh$/iu.test(source.executable) ||
        /^(?:cmd|powershell|pwsh)(?:\.exe)?$/iu.test(source.executable) ||
        source.executable.includes('/') ||
        source.executable.includes('\\')
    ) {
        fail(`${path}.executable`, 'shells and executable paths are forbidden');
    }
    if (!revisionPattern.test(source.revision)) {
        fail(`${path}.revision`, 'must be a SHA-256 revision');
    }
    return source;
}

function validateCommand(value, index) {
    const path = `commands[${index}]`;
    assertExactKeys(value, commandKeys, path);
    const command = {
        batchEligible: value.batchEligible,
        category: requiredString(value.category, `${path}.category`, 64),
        conflictsWith: stringArray(
            value.conflictsWith,
            `${path}.conflictsWith`,
        ),
        description: requiredString(
            value.description,
            `${path}.description`,
            400,
        ),
        disabledReason:
            value.disabledReason === null
                ? null
                : requiredString(
                      value.disabledReason,
                      `${path}.disabledReason`,
                      300,
                  ),
        enabled: value.enabled,
        id: requiredString(value.id, `${path}.id`, 80),
        kind: requiredString(value.kind, `${path}.kind`, 16),
        outputProtocol: requiredString(
            value.outputProtocol,
            `${path}.outputProtocol`,
            24,
        ),
        source: validateSource(value.source, `${path}.source`),
        title: requiredString(value.title, `${path}.title`, 100),
    };
    if (!commandIdPattern.test(command.id)) {
        fail(`${path}.id`, 'must be a lowercase command identifier');
    }
    if (typeof command.enabled !== 'boolean') {
        fail(`${path}.enabled`, 'must be boolean');
    }
    if (typeof command.batchEligible !== 'boolean') {
        fail(`${path}.batchEligible`, 'must be boolean');
    }
    if (!['service', 'task'].includes(command.kind)) {
        fail(`${path}.kind`, 'must be service or task');
    }
    if (!['codex-jsonl', 'plain'].includes(command.outputProtocol)) {
        fail(`${path}.outputProtocol`, 'must be plain or codex-jsonl');
    }
    if (command.enabled === (command.disabledReason !== null)) {
        fail(
            path,
            'enabled commands require null disabledReason and disabled commands require a reason',
        );
    }
    if (!command.enabled && command.batchEligible) {
        fail(path, 'disabled commands cannot be batch eligible');
    }
    if (command.conflictsWith.includes(command.id)) {
        fail(`${path}.conflictsWith`, 'cannot include the command itself');
    }
    return command;
}

export function validateCatalogDocument(value) {
    assertExactKeys(value, catalogKeys, 'catalog');
    if (value.version !== 1) fail('catalog.version', 'must equal 1');
    if (!Array.isArray(value.commands) || value.commands.length === 0) {
        fail('catalog.commands', 'must be a non-empty array');
    }
    const commands = value.commands.map(validateCommand);
    const byId = new Map();
    const packageSources = new Map();
    for (const command of commands) {
        if (byId.has(command.id))
            fail('catalog.commands', `duplicate ID '${command.id}'`);
        byId.set(command.id, command);
        if (command.source.type === 'package-script') {
            if (packageSources.has(command.source.script)) {
                fail(
                    'catalog.commands',
                    `package script '${command.source.script}' is classified more than once`,
                );
            }
            packageSources.set(command.source.script, command.id);
        }
    }
    for (const command of commands) {
        for (const conflict of command.conflictsWith) {
            const other = byId.get(conflict);
            if (!other) {
                fail(
                    `catalog command '${command.id}'`,
                    `unknown conflict '${conflict}'`,
                );
            }
            if (!other.conflictsWith.includes(command.id)) {
                fail(
                    `catalog command '${command.id}'`,
                    `conflict '${conflict}' must be symmetric`,
                );
            }
        }
    }
    return { commands, version: 1 };
}

function titleFromId(id) {
    return id
        .split(/[:-]/u)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' · ');
}

function safeRelativePath(repositoryRoot, absolutePath) {
    const relativePath = relative(repositoryRoot, absolutePath);
    return (
        relativePath.length > 0 &&
        relativePath !== '..' &&
        !relativePath.startsWith(`..${sep}`) &&
        !isAbsolute(relativePath)
    );
}

async function validateDocumentedSource(source, repositoryRoot) {
    const sourcePath = resolve(repositoryRoot, source.path);
    const cwd = resolve(repositoryRoot, source.cwd);
    if (
        !safeRelativePath(repositoryRoot, sourcePath) ||
        (cwd !== repositoryRoot && !safeRelativePath(repositoryRoot, cwd))
    ) {
        return { issue: 'documented command escapes the repository' };
    }
    try {
        const [canonicalSourcePath, canonicalCwd] = await Promise.all([
            realpath(sourcePath),
            realpath(cwd),
        ]);
        if (
            canonicalSourcePath !== sourcePath ||
            !safeRelativePath(repositoryRoot, canonicalSourcePath)
        ) {
            return {
                issue: 'documented command source must be a regular repository file without symbolic links',
            };
        }
        const sourceStat = await stat(canonicalSourcePath);
        if (!sourceStat.isFile()) {
            return {
                issue: 'documented command source must be a regular file',
            };
        }
        if (
            canonicalCwd !== cwd ||
            (!safeRelativePath(repositoryRoot, canonicalCwd) &&
                canonicalCwd !== repositoryRoot)
        ) {
            return {
                issue: 'documented command cwd must stay inside the repository without symbolic links',
            };
        }
        const content = await readFile(canonicalSourcePath, 'utf8');
        if (!content.includes(source.command)) {
            return {
                issue: `documented command is no longer present in ${source.path}`,
            };
        }
        const actualRevision = documentedCommandRevision(source);
        if (actualRevision !== source.revision) {
            return { issue: 'documented command source revision changed' };
        }
        return {
            execution: {
                args: [...source.args],
                cwd: canonicalCwd,
                executable: source.executable,
            },
        };
    } catch (error) {
        return {
            issue: `documented command source unavailable (${error.code ?? 'read failed'})`,
        };
    }
}

async function validatePackageManagerEntrypoint(entrypoint) {
    if (
        typeof entrypoint !== 'string' ||
        !isAbsolute(entrypoint) ||
        !/(?:^|[\\/])pnpm\.cjs$/iu.test(entrypoint)
    ) {
        return {
            issue: 'pnpm JavaScript entrypoint is unavailable; start the panel through pnpm',
        };
    }
    try {
        const canonicalEntrypoint = await realpath(entrypoint);
        const entrypointStat = await stat(canonicalEntrypoint);
        if (!entrypointStat.isFile()) {
            return {
                issue: 'pnpm JavaScript entrypoint is not a regular file',
            };
        }
        return { entrypoint: canonicalEntrypoint };
    } catch (error) {
        return {
            issue: `pnpm JavaScript entrypoint is unavailable (${error.code ?? 'read failed'})`,
        };
    }
}

export async function loadCatalog({
    catalogPath,
    packageManagerEntrypoint = process.env.npm_execpath,
    platform = process.platform,
    repositoryRoot,
}) {
    const [rawCatalog, rawPackage] = await Promise.all([
        readFile(catalogPath, 'utf8'),
        readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
    ]);
    const catalog = validateCatalogDocument(JSON.parse(rawCatalog));
    const packageDocument = JSON.parse(rawPackage);
    if (!isPlainObject(packageDocument.scripts)) {
        fail('package.json scripts', 'must be an object');
    }
    const packageScripts = new Map(Object.entries(packageDocument.scripts));
    const classifiedScripts = new Set();
    const issues = [];
    const commands = [];
    const packageManager = await validatePackageManagerEntrypoint(
        packageManagerEntrypoint,
    );

    for (const command of catalog.commands) {
        let sourceIssue;
        let platformIssue;
        let execution;
        let actualRevision;
        if (command.source.type === 'package-script') {
            const value = packageScripts.get(command.source.script);
            classifiedScripts.add(command.source.script);
            if (typeof value !== 'string') {
                sourceIssue = `package script '${command.source.script}' no longer exists`;
            } else {
                actualRevision = packageScriptRevision(
                    command.source.script,
                    value,
                );
                if (actualRevision !== command.source.revision) {
                    sourceIssue = `package script '${command.source.script}' changed after review`;
                } else if (packageManager.issue) {
                    sourceIssue = packageManager.issue;
                } else {
                    execution = {
                        args: [
                            packageManager.entrypoint,
                            'run',
                            command.source.script,
                        ],
                        cwd: repositoryRoot,
                        executable: 'node',
                    };
                }
            }
        } else {
            const result = await validateDocumentedSource(
                command.source,
                repositoryRoot,
            );
            sourceIssue = result.issue;
            execution = result.execution;
            actualRevision = documentedCommandRevision(command.source);
        }
        if (platform === 'win32') {
            platformIssue =
                'Command execution is unavailable on Windows until reliable Job Object supervision is implemented.';
            execution = undefined;
        }
        if (sourceIssue) issues.push(`${command.id}: ${sourceIssue}`);
        commands.push({
            ...command,
            actualRevision: actualRevision ?? null,
            available: command.enabled && !sourceIssue && !platformIssue,
            execution: execution ?? null,
            runtimeReason:
                sourceIssue ?? platformIssue ?? command.disabledReason,
        });
    }

    for (const [script] of [...packageScripts.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        if (classifiedScripts.has(script)) continue;
        const issue = `package script '${script}' has not been reviewed`;
        issues.push(`${script}: ${issue}`);
        commands.push({
            actualRevision: packageScriptRevision(
                script,
                packageScripts.get(script),
            ),
            available: false,
            batchEligible: false,
            category: 'Needs review',
            conflictsWith: [],
            description:
                'This root package script was added after the command catalog was reviewed.',
            disabledReason: issue,
            enabled: false,
            execution: null,
            id: script,
            kind: 'task',
            outputProtocol: 'plain',
            runtimeReason: issue,
            source: {
                revision: null,
                script,
                type: 'package-script',
            },
            title: titleFromId(script),
        });
    }

    return {
        commands,
        issues,
        sourcePaths: [
            catalogPath,
            resolve(repositoryRoot, 'package.json'),
            ...catalog.commands
                .filter(({ source }) => source.type === 'documented-command')
                .map(({ source }) => resolve(repositoryRoot, source.path)),
        ],
        version: catalog.version,
    };
}

function publicCommand(command) {
    return {
        actualRevision: command.actualRevision,
        available: command.available,
        batchEligible: command.batchEligible,
        category: command.category,
        conflictsWith: command.conflictsWith,
        description: command.description,
        displayCommand:
            command.source.type === 'package-script'
                ? `pnpm run ${command.source.script}`
                : command.source.command,
        enabled: command.enabled,
        id: command.id,
        kind: command.kind,
        outputProtocol: command.outputProtocol,
        reviewedRevision: command.source.revision,
        runtimeReason: command.runtimeReason,
        sourcePath:
            command.source.type === 'package-script'
                ? 'package.json'
                : command.source.path,
        title: command.title,
    };
}

export class CatalogStore extends EventEmitter {
    #catalogPath;
    #debounce;
    #packageManagerEntrypoint;
    #platform;
    #repositoryRoot;
    #refreshPromise;
    #snapshot;
    #watchers = [];

    constructor({
        catalogPath,
        packageManagerEntrypoint,
        platform,
        repositoryRoot,
    }) {
        super();
        this.#catalogPath = catalogPath;
        this.#packageManagerEntrypoint = packageManagerEntrypoint;
        this.#platform = platform;
        this.#repositoryRoot = repositoryRoot;
    }

    async refresh() {
        if (this.#refreshPromise) return this.#refreshPromise;
        this.#refreshPromise = (async () => {
            const loaded = await loadCatalog({
                catalogPath: this.#catalogPath,
                packageManagerEntrypoint: this.#packageManagerEntrypoint,
                platform: this.#platform,
                repositoryRoot: this.#repositoryRoot,
            });
            const comparable = JSON.stringify({
                commands: loaded.commands.map(publicCommand),
                issues: loaded.issues,
                version: loaded.version,
            });
            const changed = this.#snapshot?.comparable !== comparable;
            this.#snapshot = { ...loaded, comparable };
            if (changed) {
                this.emit('changed', this.publicSnapshot());
                if (this.#watchers.length > 0) this.#restartWatchers();
            }
            return this.#snapshot;
        })().finally(() => {
            this.#refreshPromise = undefined;
        });
        return this.#refreshPromise;
    }

    publicSnapshot() {
        if (!this.#snapshot) throw new Error('catalog has not been loaded');
        return {
            commands: this.#snapshot.commands.map(publicCommand),
            issues: [...this.#snapshot.issues],
            version: this.#snapshot.version,
        };
    }

    getCommand(id) {
        return this.#snapshot?.commands.find((command) => command.id === id);
    }

    get issues() {
        return [...(this.#snapshot?.issues ?? [])];
    }

    startWatching() {
        if (!this.#snapshot) throw new Error('catalog has not been loaded');
        this.#restartWatchers();
    }

    #restartWatchers() {
        for (const watcher of this.#watchers) watcher.close();
        this.#watchers = [];
        for (const path of new Set(this.#snapshot.sourcePaths)) {
            try {
                const watcher = watch(path, { persistent: false }, () => {
                    clearTimeout(this.#debounce);
                    this.#debounce = setTimeout(() => {
                        this.refresh().catch((error) =>
                            this.emit('watch-error', {
                                code: error.code ?? 'CATALOG_RELOAD_FAILED',
                            }),
                        );
                    }, 75);
                });
                this.#watchers.push(watcher);
            } catch (error) {
                this.emit('watch-error', {
                    code: error.code ?? 'CATALOG_WATCH_FAILED',
                });
            }
        }
    }

    close() {
        clearTimeout(this.#debounce);
        for (const watcher of this.#watchers) watcher.close();
        this.#watchers = [];
    }
}

export function commandIsActive(run) {
    return run ? activeStatuses.has(run.status) : false;
}
