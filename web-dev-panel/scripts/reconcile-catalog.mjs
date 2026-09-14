#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reconcileExistingPackageCommand } from '../src/catalog-reconciliation.mjs';
import { packageScriptRevision } from '../src/source-revision.mjs';

if (process.argv.slice(2).join(' ') !== '--confirm-reviewed') {
    throw new Error(
        'Catalog updates require --confirm-reviewed after inspecting every changed command.',
    );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const panelRoot = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(panelRoot, '..');
const catalogPath = resolve(panelRoot, 'commands.json');
const packageDocument = JSON.parse(
    await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
);

const initialServices = new Set([
    'dev',
    'dev:admin',
    'dev:apps:docker',
    'dev:backend',
    'dev:dictionary-worker',
    'dev:infra',
    'dev:mastra',
    'dev:mobile',
    'dev:web',
]);
const initialConflicts = {
    dev: ['dev:admin', 'dev:apps:docker', 'dev:backend', 'dev:web'],
    'dev:admin': ['dev', 'dev:apps:docker'],
    'dev:apps:docker': ['dev', 'dev:admin', 'dev:backend', 'dev:web'],
    'dev:backend': ['dev', 'dev:apps:docker'],
    'dev:web': ['dev', 'dev:apps:docker'],
};
const descriptions = {
    'admin:audit:prune':
        'Prunes eligible administration audit records through the guarded backend membership CLI.',
    'admin:membership':
        'Runs guarded local administration membership operations against the configured backend.',
    'admin:membership:remote':
        'Runs guarded membership operations against an active remote deployment image.',
    'admin:membership:stdin':
        'Reads a private JSON membership request from stdin and applies it through the backend CLI.',
    agent: 'Launches the interactive Codex terminal through the repository Headroom wrapper.',
    'agent-skills:check':
        'Validates repository agent skill structure and policy.',
    browser:
        'Runs the repository browser-verification wrapper with a required reviewed subcommand.',
    'browser:check':
        'Tests and diagnoses the pinned local browser-verification wrapper.',
    'browser:install':
        'Installs the browser runtime used by the repository verification wrapper.',
    build: 'Builds all buildable workspaces.',
    check: 'Runs the complete repository quality and build gate.',
    'db:check': 'Validates the backend Drizzle migration history.',
    'db:generate':
        'Generates Drizzle SQL migration files from backend schema changes.',
    'db:migrate':
        'Applies pending backend PostgreSQL migrations to the configured database; run individually.',
    'db:studio':
        'Starts Drizzle Studio for interactive local database inspection.',
    'deploy:local': 'Runs the disposable local deployment rehearsal journey.',
    'deploy:local:down':
        'Stops the disposable local deployment rehearsal environment.',
    'deploy:local:rollback':
        'Exercises rollback in the disposable local deployment rehearsal.',
    'deploy:local:verify':
        'Verifies the disposable local deployment rehearsal environment.',
    'deploy:remote': 'Runs guarded remote VPS deployment operations.',
    dev: 'Starts the main local application development services in parallel.',
    'dev:admin':
        'Starts only the administration application development server.',
    'dev:admin:docker':
        'Builds and starts the administration application development container.',
    'dev:apps:docker':
        'Builds and starts backend, web, and admin with local infrastructure in Docker.',
    'dev:backend': 'Starts only the backend development server.',
    'dev:dictionary-worker':
        'Starts the local asynchronous dictionary generation worker.',
    'dev:infra': 'Starts the local PostgreSQL and Redis containers.',
    'dev:mastra': 'Provisions and starts isolated local Mastra Studio.',
    'dev:mobile':
        'Starts the Expo mobile development server, whose default host mode is LAN.',
    'dev:mobile:docker': 'Builds and starts the mobile development container.',
    'dev:panel':
        'Starts this web dev command panel; disabled here to prevent recursion.',
    'dev:web': 'Starts only the public Next.js development server.',
    'dev:web:docker': 'Builds and starts the public web development container.',
    'docs:user-flows:check':
        'Validates user-flow guide structure and traceability.',
    'feature:new':
        'Creates a feature branch and its durable specification, plan, evidence, and review artifacts.',
    format: 'Writes repository files using the configured Prettier formatter.',
    'format:check': 'Checks repository formatting without changing files.',
    'infra:down':
        'Stops local PostgreSQL and Redis containers without deleting volumes.',
    lint: 'Runs repository ESLint checks.',
    'mastra:playground:reset': 'Resets guarded local Mastra playground state.',
    'resources:dashboard':
        'Generates a local runtime-resource dashboard HTML artifact from recorded history.',
    'resources:profile':
        'Profiles a named local command and writes bounded diagnostic artifacts.',
    test: 'Runs the repository automated test suite.',
    'test:agent-browser': 'Runs unit tests for the safe browser wrapper.',
    'test:coverage': 'Runs workspace tests with coverage collection.',
    'test:e2e:admin-user-management':
        'Runs the administration user-management end-to-end journey.',
    'test:e2e:web-dev-panel':
        'Runs web dev panel Playwright journeys against synthetic commands.',
    'test:frontend-architecture':
        'Tests public web and admin Feature-Sliced Design import boundaries.',
    'test:mastra-harness':
        'Tests the isolated Mastra development harness lifecycle.',
    'test:release-deployment':
        'Runs release, backup, migration, deployment, and resource contract tests.',
    'test:web-dev-panel':
        'Runs web dev panel unit and native HTTP integration tests.',
    typecheck: 'Runs TypeScript checks across the workspace.',
    'user-flow:e2e':
        'Inspects or validates a named user-flow guide through a required subcommand.',
    'user-flow:e2e:check':
        'Validates all mapped user-flow E2E markers without executing journeys.',
    'web-dev-panel:check':
        'Validates this panel command catalog against current sources.',
};

function title(id) {
    return id
        .split(':')
        .map((section) =>
            section
                .split('-')
                .map((part) => part[0].toUpperCase() + part.slice(1))
                .join(' '),
        )
        .join(' · ');
}

function category(id) {
    if (id.startsWith('admin:')) return 'Administration';
    if (id.startsWith('browser')) return 'Browser tooling';
    if (id.startsWith('db:')) return 'Database';
    if (id.startsWith('deploy:')) return 'Deployment';
    if (id.startsWith('dev') || id === 'infra:down') return 'Development';
    if (id.startsWith('docs:') || id.startsWith('user-flow:'))
        return 'Documentation';
    if (id.startsWith('agent') || id.startsWith('feature:'))
        return 'Agent workflow';
    if (id.startsWith('resources:')) return 'Resources';
    if (id.startsWith('test')) return 'Tests';
    if (
        [
            'build',
            'check',
            'format',
            'format:check',
            'lint',
            'typecheck',
            'web-dev-panel:check',
        ].includes(id)
    )
        return 'Quality';
    return 'Other';
}

function initialCommand(id, script) {
    return {
        batchEligible: false,
        category: category(id),
        conflictsWith: initialConflicts[id] ?? [],
        description:
            descriptions[id] ??
            'New root package script awaiting a description and safety review.',
        disabledReason:
            'Initial catalog creation requires an explicit safety review.',
        enabled: false,
        id,
        kind: initialServices.has(id) ? 'service' : 'task',
        outputProtocol: 'plain',
        source: {
            revision: packageScriptRevision(id, script),
            script: id,
            type: 'package-script',
        },
        title: title(id),
    };
}

let existing = { commands: [], version: 1 };
try {
    existing = JSON.parse(await readFile(catalogPath, 'utf8'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
const existingPackageCommands = new Map(
    existing.commands
        .filter(({ source }) => source.type === 'package-script')
        .map((command) => [command.source.script, command]),
);
const documentedCommands = existing.commands.filter(
    ({ source }) => source.type === 'documented-command',
);
const packageCommands = Object.entries(packageDocument.scripts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, script]) => {
        const previous = existingPackageCommands.get(id);
        if (!previous) {
            const created = initialCommand(id, script);
            return {
                ...created,
                disabledReason:
                    'New package script requires an explicit safety review.',
            };
        }
        const reconciled = reconcileExistingPackageCommand(
            previous,
            id,
            script,
        );
        if (
            previous.description ===
                `Runs the reviewed root package script “${id}”.` &&
            descriptions[id]
        ) {
            reconciled.description = descriptions[id];
        }
        return reconciled;
    });
const currentPackageScripts = new Set(Object.keys(packageDocument.scripts));
const missingPackageCommands = [...existingPackageCommands]
    .filter(([script]) => !currentPackageScripts.has(script))
    .map(([, command]) => command);

await writeFile(
    catalogPath,
    `${JSON.stringify({ commands: [...packageCommands, ...missingPackageCommands, ...documentedCommands], version: 1 }, null, 2)}\n`,
);
console.log(
    `Reconciled ${packageCommands.length} package scripts, ${missingPackageCommands.length} missing sources, and ${documentedCommands.length} documented commands.`,
);
