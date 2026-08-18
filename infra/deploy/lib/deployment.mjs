import {
    appendFile,
    mkdir,
    readFile,
    rename,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { createAuditRecord } from './audit.mjs';
import { acquireDeployLock } from './lock.mjs';

const SLOTS = ['blue', 'green'];
const DEFAULT_DRAIN_SECONDS = 300;

const now = () => Date.now();

function inactiveSlot(activeSlot) {
    return activeSlot === 'blue' ? 'green' : 'blue';
}

async function readState(stateDirectory) {
    try {
        const value = JSON.parse(
            await readFile(
                path.join(stateDirectory, 'deployment-state.json'),
                'utf8',
            ),
        );
        if (!SLOTS.includes(value.activeSlot))
            throw new Error('Invalid active slot.');
        return value;
    } catch (error) {
        if (error.code === 'ENOENT')
            return { activeSlot: null, current: null, previous: null };
        throw new Error('Deployment state is invalid.', { cause: error });
    }
}

async function writeJsonAtomic(filePath, value, mode = 0o600) {
    const temporary = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
    await rename(temporary, filePath);
}

function composeArguments(files, project, rest) {
    return [
        'compose',
        ...files.flatMap((file) => ['-f', file]),
        '--project-name',
        project,
        ...rest,
    ];
}

export class Deployment {
    constructor({
        environment,
        config,
        configPath,
        manifest,
        repositoryRoot,
        runtimeDirectory,
        stateDirectory,
        runner,
        actor = process.env.GITHUB_ACTOR || process.env.USER || 'local',
        drainSeconds = DEFAULT_DRAIN_SECONDS,
        pollMilliseconds = 1000,
    }) {
        this.environment = environment;
        this.config = config;
        this.configPath = configPath;
        this.manifest = manifest;
        this.repositoryRoot = repositoryRoot;
        this.runtimeDirectory = runtimeDirectory;
        this.stateDirectory = stateDirectory;
        this.runner = runner;
        this.actor = actor;
        this.drainSeconds = drainSeconds;
        this.pollMilliseconds = pollMilliseconds;
        this.projectPrefix =
            config.DEPLOY_PROJECT_PREFIX || `languon-${environment}`;
        this.composeDirectory = path.join(
            repositoryRoot,
            'infra/deploy/compose',
        );
        this.nginxDirectory = path.join(repositoryRoot, 'infra/nginx');
        this.timings = {};
    }

    commandEnvironment(slot) {
        return {
            ...process.env,
            ...this.config,
            DEPLOY_ENVIRONMENT: this.environment,
            DEPLOY_PROJECT_PREFIX: this.projectPrefix,
            DEPLOY_SLOT: slot,
            APP_ENV: this.environment === 'stage' ? 'staging' : 'production',
            DEPLOY_RUNTIME_DIR: this.runtimeDirectory,
            RELEASE_SHA: this.manifest.sourceSha,
            BACKEND_IMAGE: this.manifest.images.backend,
            WEB_IMAGE: this.manifest.images.web,
            ADMIN_IMAGE: this.manifest.images.admin,
            MIGRATOR_IMAGE: this.manifest.images.migrator,
        };
    }

    async compose(files, project, rest, slot) {
        await this.runner('docker', composeArguments(files, project, rest), {
            env: this.commandEnvironment(slot),
        });
    }

    async timed(name, operation) {
        const started = now();
        try {
            return await operation();
        } finally {
            this.timings[name] = now() - started;
        }
    }

    async prepare() {
        await mkdir(this.runtimeDirectory, { recursive: true, mode: 0o700 });
        await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
        const upstreamPath = path.join(
            this.runtimeDirectory,
            'active-upstream.conf',
        );
        try {
            await readFile(upstreamPath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await writeFile(
                upstreamPath,
                'upstream languon_web { server 127.0.0.1:9; }\nupstream languon_backend { server 127.0.0.1:9; }\nupstream languon_admin { server 127.0.0.1:9; }\n',
                { mode: 0o600 },
            );
        }
    }

    renderUpstream(slot) {
        return [
            `upstream languon_web { server ${slot}-web:3333; keepalive 32; }`,
            `upstream languon_backend { server ${slot}-backend:4000; keepalive 32; }`,
            `upstream languon_admin { server ${slot}-admin:3001; keepalive 8; }`,
            '',
        ].join('\n');
    }

    async writeUpstream(slot) {
        const target = path.join(this.runtimeDirectory, 'active-upstream.conf');
        const temporary = `${target}.${process.pid}.tmp`;
        await writeFile(temporary, this.renderUpstream(slot), { mode: 0o600 });
        await rename(temporary, target);
    }

    async ensureNetworks() {
        for (const suffix of ['edge', 'data']) {
            const network = `${this.projectPrefix}-${suffix}`;
            const exists = await this.runner(
                'docker',
                ['network', 'inspect', network],
                {
                    capture: true,
                },
            ).then(
                () => true,
                () => false,
            );
            if (!exists) {
                const args = ['network', 'create'];
                if (suffix === 'edge')
                    args.push('--subnet', this.config.EDGE_SUBNET);
                args.push(network);
                await this.runner('docker', args);
            }
        }
    }

    async runMigration(slot) {
        const files = [
            path.join(this.composeDirectory, 'migrate.compose.yaml'),
        ];
        if (this.environment === 'production') {
            files.push(
                path.join(
                    this.composeDirectory,
                    'migrate.production.compose.yaml',
                ),
            );
        }
        await this.compose(
            files,
            `${this.projectPrefix}-migration`,
            ['pull', 'migrator'],
            slot,
        );
        await this.compose(
            files,
            `${this.projectPrefix}-migration`,
            ['run', '--rm', '--no-deps', 'migrator'],
            slot,
        );
    }

    async verifyBackupGate() {
        if (this.environment !== 'production') return;
        await this.runner(
            path.join(this.repositoryRoot, 'infra/backup/backup.sh'),
            [
                'check-fresh',
                '--environment',
                'production',
                '--manifest',
                this.config.BACKUP_MANIFEST_PATH,
                '--max-age-hours',
                '24',
            ],
            { capture: true },
        );
    }

    async startSlot(slot) {
        const files = [path.join(this.composeDirectory, 'apps.compose.yaml')];
        if (this.environment === 'production') {
            files.push(
                path.join(
                    this.composeDirectory,
                    'apps.production.compose.yaml',
                ),
            );
        }
        const project = `${this.projectPrefix}-${slot}`;
        await this.compose(files, project, ['pull'], slot);
        await this.compose(
            files,
            project,
            ['up', '--detach', '--no-build', '--wait', '--wait-timeout', '120'],
            slot,
        );
    }

    async stopSlot(slot) {
        if (!slot) return;
        const files = [path.join(this.composeDirectory, 'apps.compose.yaml')];
        if (this.environment === 'production') {
            files.push(
                path.join(
                    this.composeDirectory,
                    'apps.production.compose.yaml',
                ),
            );
        }
        await this.compose(
            files,
            `${this.projectPrefix}-${slot}`,
            ['down', '--remove-orphans'],
            slot,
        );
    }

    async readiness(slot) {
        const network = `${this.projectPrefix}-edge`;
        const checks = [
            [`http://${slot}-backend:4000/readyz`, this.manifest.sourceSha],
            [`http://${slot}-web:3333/healthz`, this.manifest.sourceSha],
            [`http://${slot}-admin:3001/healthz`, this.manifest.sourceSha],
        ];
        for (const [url, release] of checks) {
            await this.runner(
                'docker',
                [
                    'run',
                    '--rm',
                    '--network',
                    network,
                    'curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6',
                    '--fail',
                    '--silent',
                    '--show-error',
                    '--retry',
                    '20',
                    '--retry-all-errors',
                    '--retry-delay',
                    '2',
                    url,
                ],
                { capture: true, env: this.commandEnvironment(slot) },
            ).then(({ stdout }) => {
                if (!stdout.includes(release)) {
                    throw new Error(
                        `Readiness response from ${url} has the wrong release identity.`,
                    );
                }
            });
        }
    }

    async validateAndSwitch(slot, edgeAlreadyRunning) {
        const upstreamPath = path.join(
            this.runtimeDirectory,
            'active-upstream.conf',
        );
        const previous = await readFile(upstreamPath, 'utf8');
        await this.writeUpstream(slot);
        const edgeFile = path.join(this.composeDirectory, 'edge.compose.yaml');
        const project = `${this.projectPrefix}-edge`;
        try {
            if (edgeAlreadyRunning) {
                await this.runner('docker', [
                    'exec',
                    `${project}-nginx`,
                    'nginx',
                    '-t',
                ]);
                await this.runner('docker', [
                    'exec',
                    `${project}-nginx`,
                    'nginx',
                    '-s',
                    'reload',
                ]);
                return;
            }
            await this.compose(
                [edgeFile],
                project,
                ['up', '--detach', '--wait'],
                slot,
            );
            await this.runner('docker', [
                'exec',
                `${project}-nginx`,
                'nginx',
                '-t',
            ]);
        } catch (error) {
            const temporary = `${upstreamPath}.${process.pid}.rollback`;
            await writeFile(temporary, previous, { mode: 0o600 });
            await rename(temporary, upstreamPath);
            throw error;
        }
    }

    async smoke(expectedSourceSha = this.manifest.sourceSha) {
        const url = `${this.config.PUBLIC_BASE_URL}/healthz`;
        for (let attempt = 1; attempt <= 30; attempt += 1) {
            const args = ['--fail', '--silent', '--show-error'];
            if (this.config.TLS_CA_PATH) {
                args.push('--cacert', this.config.TLS_CA_PATH);
            }
            args.push(url);
            const result = await this.runner('curl', args, {
                capture: true,
            }).catch(() => null);
            if (result?.stdout.includes(expectedSourceSha)) return;
            if (attempt < 30) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        throw new Error(
            'Edge smoke check did not reach the selected release identity.',
        );
    }

    async hasOldWorkers() {
        const project = `${this.projectPrefix}-edge`;
        const result = await this.runner(
            'docker',
            [
                'exec',
                project + '-nginx',
                'sh',
                '-c',
                "ps | grep -q '[w]orker process is shutting down'",
            ],
            { capture: true },
        ).then(
            () => true,
            () => false,
        );
        return result;
    }

    async drain() {
        const deadline = now() + this.drainSeconds * 1000;
        while (await this.hasOldWorkers()) {
            if (now() >= deadline) return { forced: true };
            await new Promise((resolve) =>
                setTimeout(resolve, this.pollMilliseconds),
            );
        }
        return { forced: false };
    }

    async appendAudit(record) {
        await appendFile(
            path.join(this.stateDirectory, 'deployment-audit.jsonl'),
            `${JSON.stringify(record)}\n`,
            { mode: 0o600 },
        );
    }

    async deploy({ skipMigration = false, successOutcome = 'succeeded' } = {}) {
        await this.prepare();
        const release = await acquireDeployLock(
            this.stateDirectory,
            this.manifest.identity,
        );
        const startedAt = new Date().toISOString();
        const state = await readState(this.stateDirectory);
        const nextSlot = state.activeSlot
            ? inactiveSlot(state.activeSlot)
            : 'blue';
        let phase = 'migration';
        let switched = false;
        let committed = false;
        let migration = {
            outcome: 'not-run',
            ledger: this.manifest.migration.ledger,
        };
        try {
            await this.ensureNetworks();
            if (!skipMigration) {
                phase = 'backup-gate';
                await this.timed('backupGateMs', () => this.verifyBackupGate());
                phase = 'migration';
                await this.timed('migrationMs', () =>
                    this.runMigration(nextSlot),
                );
                migration = {
                    outcome: 'succeeded',
                    ledger: this.manifest.migration.ledger,
                };
            }
            phase = 'start';
            await this.timed('startMs', () => this.startSlot(nextSlot));
            phase = 'readiness';
            await this.timed('readinessMs', () => this.readiness(nextSlot));
            phase = 'switch';
            await this.timed('switchMs', () =>
                this.validateAndSwitch(nextSlot, Boolean(state.activeSlot)),
            );
            switched = true;
            phase = 'smoke';
            await this.timed('smokeMs', () => this.smoke());
            const newState = {
                activeSlot: nextSlot,
                current: this.manifest,
                previous: state.current,
                updatedAt: new Date().toISOString(),
            };
            await writeJsonAtomic(
                path.join(this.stateDirectory, 'deployment-state.json'),
                newState,
            );
            committed = true;
            phase = 'drain';
            const drain = await this.timed('drainMs', () => this.drain());
            phase = 'cleanup';
            await this.timed('cleanupMs', () =>
                this.stopSlot(state.activeSlot),
            );
            const audit = createAuditRecord({
                actor: this.actor,
                environment: this.environment,
                manifest: this.manifest,
                migration,
                newSlot: nextSlot,
                previousSlot: state.activeSlot,
                outcome: successOutcome,
                startedAt,
                timings: this.timings,
                forcedDrain: drain.forced,
            });
            phase = 'audit';
            await this.appendAudit(audit);
            return audit;
        } catch (error) {
            let safeToStopNewSlot = !switched || !state.activeSlot;
            if (!committed && switched && state.activeSlot) {
                try {
                    await this.validateAndSwitch(state.activeSlot, true);
                    await this.smoke(state.current.sourceSha);
                    safeToStopNewSlot = true;
                } catch (rollbackError) {
                    error.rollbackError = rollbackError;
                }
            }
            if (!committed && safeToStopNewSlot) {
                await this.stopSlot(nextSlot).catch(() => {});
            }
            const audit = createAuditRecord({
                actor: this.actor,
                environment: this.environment,
                manifest: this.manifest,
                migration:
                    phase === 'migration'
                        ? { ...migration, outcome: 'failed' }
                        : migration,
                newSlot: nextSlot,
                previousSlot: state.activeSlot,
                outcome: 'failed',
                startedAt,
                timings: this.timings,
                failurePhase: phase,
            });
            await this.appendAudit(audit).catch((auditError) => {
                error.auditError = auditError;
            });
            throw error;
        } finally {
            await release();
        }
    }

    async verify() {
        const state = await readState(this.stateDirectory);
        if (!state.activeSlot || !state.current)
            throw new Error('No active deployment exists.');
        this.manifest = state.current;
        await this.readiness(state.activeSlot);
        await this.smoke();
        return state;
    }

    async rollback() {
        const state = await readState(this.stateDirectory);
        if (!state.previous)
            throw new Error('No previous digest manifest is available.');
        this.manifest = state.previous;
        return await this.deploy({
            skipMigration: true,
            successOutcome: 'rolled-back',
        });
    }
}
