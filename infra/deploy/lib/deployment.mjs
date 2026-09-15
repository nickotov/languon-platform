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
import {
    assertDictionaryJobRollbackCompatibility,
    EMPTY_DICTIONARY_JOB_CAPABILITIES,
} from './manifest.mjs';

const SLOTS = ['blue', 'green'];
const DEFAULT_DRAIN_SECONDS = 300;
const DICTIONARY_GENERATION_BUDGET_ENVIRONMENT = Object.freeze({
    maxInputTokensPerAttempt: 'DICTIONARY_GENERATION_MAX_INPUT_TOKENS',
    maxOutputTokensPerAttempt: 'DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS',
    inputCostMicrosPerMillionTokens:
        'DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS',
    outputCostMicrosPerMillionTokens:
        'DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS',
    maxCostMicrosPerAttempt:
        'DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT',
});

const now = () => Date.now();

function inactiveSlot(activeSlot) {
    return activeSlot === 'blue' ? 'green' : 'blue';
}

export function assertDictionaryGenerationBudgetConfig(manifest, config) {
    const budget = manifest.dictionaryJobs?.generationBudget;
    if (!budget) return;
    const configuredValues = Object.values(
        DICTIONARY_GENERATION_BUDGET_ENVIRONMENT,
    ).filter(
        (environmentName) =>
            config[environmentName] !== undefined &&
            config[environmentName] !== '',
    );
    if (
        configuredValues.length === 0 &&
        (config.DICTIONARY_GENERATION_PROVIDER_MODE ?? 'unavailable') ===
            'unavailable' &&
        manifest.dictionaryJobs.workerProcessable.length === 0
    ) {
        return;
    }
    const mismatches = Object.entries(DICTIONARY_GENERATION_BUDGET_ENVIRONMENT)
        .filter(([name, environmentName]) => {
            return (
                String(config[environmentName] ?? '') !== String(budget[name])
            );
        })
        .map(([, environmentName]) => environmentName);
    if (mismatches.length > 0) {
        throw new Error(
            `Deployment dictionary generation budget must match the release manifest: ${mismatches.join(', ')}.`,
        );
    }
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

export function assertDictionaryWorkerDatabasePrivileges(privileges) {
    if (
        privileges.jobs !== true ||
        privileges.proposals !== true ||
        privileges.providerCircuit !== true ||
        privileges.documentUploads !== true ||
        privileges.documentObjectVersions !== true ||
        privileges.documentExtractions !== true ||
        privileges.settings !== true ||
        privileges.dictionaryCardDuplicateColumns !== true ||
        privileges.jobsUnexpected !== false ||
        privileges.proposalsUnexpected !== false ||
        privileges.providerCircuitUnexpected !== false ||
        privileges.documentUploadsUnexpected !== false ||
        privileges.documentObjectVersionsUnexpected !== false ||
        privileges.documentExtractionsUnexpected !== false ||
        privileges.settingsUnexpected !== false ||
        privileges.dictionaries !== false ||
        privileges.dictionaryCards !== false ||
        privileges.dictionaryCardsUnexpectedColumns !== false ||
        privileges.dictionaryCardRevisions !== false ||
        privileges.dictionaryIdempotencyKeys !== false ||
        privileges.schemaCreate !== false ||
        privileges.users !== false ||
        privileges.userEmails !== false ||
        privileges.passwordCredentials !== false ||
        privileges.authVerificationChallenges !== false ||
        privileges.authSessions !== false ||
        privileges.authPasskeys !== false ||
        privileges.authSecurityEvents !== false ||
        privileges.adminMemberships !== false ||
        privileges.adminAuditEvents !== false
    ) {
        throw new Error(
            'Dictionary worker database privileges violate the required least-privilege boundary.',
        );
    }
}

function tablePrivilegeExpression(table, privileges, operator) {
    return `(${privileges
        .map(
            (privilege) =>
                `has_table_privilege(current_user, 'public.${table}', '${privilege}')`,
        )
        .join(` ${operator} `)})`;
}

const forbiddenTablePrivileges = [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
];

export const DICTIONARY_WORKER_DATABASE_PRIVILEGE_QUERY = `select
    ${tablePrivilegeExpression('dictionary_generation_jobs', ['SELECT', 'UPDATE'], 'and')} as "jobs",
    ${tablePrivilegeExpression('dictionary_generation_proposals', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "proposals",
    ${tablePrivilegeExpression('dictionary_generation_provider_circuit', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "providerCircuit",
    ${tablePrivilegeExpression('dictionary_document_uploads', ['SELECT', 'UPDATE'], 'and')} as "documentUploads",
    ${tablePrivilegeExpression('dictionary_document_object_versions', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "documentObjectVersions",
    ${tablePrivilegeExpression('dictionary_document_extractions', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "documentExtractions",
    has_table_privilege(current_user, 'public.dictionary_settings', 'SELECT') as "settings",
    (has_column_privilege(current_user, 'public.dictionary_cards', 'id', 'SELECT')
        and has_column_privilege(current_user, 'public.dictionary_cards', 'dictionary_id', 'SELECT')
        and has_column_privilege(current_user, 'public.dictionary_cards', 'source', 'SELECT')
        and has_column_privilege(current_user, 'public.dictionary_cards', 'sort_key', 'SELECT')) as "dictionaryCardDuplicateColumns",
    ${tablePrivilegeExpression('dictionary_generation_jobs', ['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "jobsUnexpected",
    ${tablePrivilegeExpression('dictionary_generation_proposals', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "proposalsUnexpected",
    ${tablePrivilegeExpression('dictionary_generation_provider_circuit', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "providerCircuitUnexpected",
    ${tablePrivilegeExpression('dictionary_document_uploads', ['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "documentUploadsUnexpected",
    ${tablePrivilegeExpression('dictionary_document_object_versions', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "documentObjectVersionsUnexpected",
    ${tablePrivilegeExpression('dictionary_document_extractions', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "documentExtractionsUnexpected",
    ${tablePrivilegeExpression('dictionary_settings', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "settingsUnexpected",
    ${tablePrivilegeExpression('dictionaries', forbiddenTablePrivileges, 'or')} as "dictionaries",
    ${tablePrivilegeExpression('dictionary_cards', forbiddenTablePrivileges, 'or')} as "dictionaryCards",
    exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'dictionary_cards'
          and (
              (column_name not in ('id', 'dictionary_id', 'source', 'sort_key')
                  and has_column_privilege(current_user, 'public.dictionary_cards', column_name, 'SELECT'))
              or has_column_privilege(current_user, 'public.dictionary_cards', column_name, 'INSERT')
              or has_column_privilege(current_user, 'public.dictionary_cards', column_name, 'UPDATE')
              or has_column_privilege(current_user, 'public.dictionary_cards', column_name, 'REFERENCES')
          )
    ) as "dictionaryCardsUnexpectedColumns",
    ${tablePrivilegeExpression('dictionary_card_revisions', forbiddenTablePrivileges, 'or')} as "dictionaryCardRevisions",
    ${tablePrivilegeExpression('dictionary_idempotency_keys', forbiddenTablePrivileges, 'or')} as "dictionaryIdempotencyKeys",
    has_schema_privilege(current_user, 'public', 'CREATE') as "schemaCreate",
    ${tablePrivilegeExpression('users', forbiddenTablePrivileges, 'or')} as "users",
    ${tablePrivilegeExpression('user_emails', forbiddenTablePrivileges, 'or')} as "userEmails",
    ${tablePrivilegeExpression('password_credentials', forbiddenTablePrivileges, 'or')} as "passwordCredentials",
    ${tablePrivilegeExpression('auth_verification_challenges', forbiddenTablePrivileges, 'or')} as "authVerificationChallenges",
    ${tablePrivilegeExpression('auth_sessions', forbiddenTablePrivileges, 'or')} as "authSessions",
    ${tablePrivilegeExpression('auth_passkeys', forbiddenTablePrivileges, 'or')} as "authPasskeys",
    ${tablePrivilegeExpression('auth_security_events', forbiddenTablePrivileges, 'or')} as "authSecurityEvents",
    ${tablePrivilegeExpression('admin_memberships', forbiddenTablePrivileges, 'or')} as "adminMemberships",
    ${tablePrivilegeExpression('admin_audit_events', forbiddenTablePrivileges, 'or')} as "adminAuditEvents"`;

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
        const dictionaryJobs =
            this.manifest.dictionaryJobs ?? EMPTY_DICTIONARY_JOB_CAPABILITIES;
        const dictionaryBudgetEnvironment = Object.fromEntries(
            Object.entries(DICTIONARY_GENERATION_BUDGET_ENVIRONMENT).map(
                ([name, environmentName]) => [
                    environmentName,
                    dictionaryJobs.generationBudget?.[name]?.toString() ??
                        this.config[environmentName] ??
                        '',
                ],
            ),
        );
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
            DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS:
                dictionaryJobs.workerProcessable.join(','),
            DICTIONARY_JOB_API_READABLE_FORMATS:
                dictionaryJobs.apiReadable.join(','),
            DICTIONARY_JOB_API_CANCELLABLE_FORMATS:
                dictionaryJobs.apiCancellable.join(','),
            DICTIONARY_JOB_API_DISCARDABLE_FORMATS:
                dictionaryJobs.apiDiscardable.join(','),
            DICTIONARY_JOB_API_ACCEPTABLE_FORMATS:
                dictionaryJobs.apiAcceptable.join(','),
            DICTIONARY_JOB_API_ENQUEUED_FORMATS:
                dictionaryJobs.apiEnqueued.join(','),
            DICTIONARY_JOB_WEB_READABLE_FORMATS:
                dictionaryJobs.webReadable.join(','),
            ...dictionaryBudgetEnvironment,
        };
    }

    async compose(files, project, rest, slot, options = {}) {
        return await this.runner(
            'docker',
            composeArguments(files, project, rest),
            {
                ...options,
                env: this.commandEnvironment(slot),
            },
        );
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

    async runAccountRecoveryGate(slot) {
        const files = [path.join(this.composeDirectory, 'recovery-gate.compose.yaml')];
        if (this.environment === 'production') files.push(path.join(this.composeDirectory, 'recovery-gate.production.compose.yaml'));
        await this.compose(files, `${this.projectPrefix}-recovery-gate`, ['run', '--rm', '--no-deps', 'recovery-gate'], slot);
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

    async verifyDictionaryJobRetirement(slot, formats) {
        if (!slot || formats.length === 0) return;
        const files = [path.join(this.composeDirectory, 'apps.compose.yaml')];
        if (this.environment === 'production') {
            files.push(
                path.join(
                    this.composeDirectory,
                    'apps.production.compose.yaml',
                ),
            );
        }
        const serializedFormats = JSON.stringify(formats);
        const source = [
            "import postgres from 'postgres';",
            `const formats = ${serializedFormats};`,
            'const sql = postgres(process.env.DICTIONARY_WORKER_DATABASE_URL, { connect_timeout: 5, idle_timeout: 1, max: 1, onnotice: () => undefined });',
            'try {',
            '  const [counts] = await sql`select',
            "    (select count(*)::int from dictionary_generation_jobs where format in ${sql(formats)} and execution_state in ('queued', 'running')) as \"queuedOrRunning\",",
            '    (select count(*)::int from dictionary_generation_proposals as proposals join dictionary_generation_jobs as jobs on jobs.id = proposals.job_id where jobs.format in ${sql(formats)} and proposals.review_state = \'reviewable\') as "reviewableProposals",',
            '    (select count(*)::int from dictionary_document_uploads as uploads join dictionary_generation_jobs as jobs on jobs.id = uploads.job_id where jobs.format in ${sql(formats)} and jobs.awaiting_upload_at is not null) as "documentAwaitingUploads",',
            "    (select count(*)::int from dictionary_document_uploads as uploads join dictionary_generation_jobs as jobs on jobs.id = uploads.job_id where jobs.format in ${sql(formats)} and uploads.processing_state in ('authorized', 'quarantined', 'scanning', 'clean', 'extracting', 'cleaning')) as \"documentProcessingUploads\",",
            "    (select count(*)::int from dictionary_document_uploads as uploads join dictionary_generation_jobs as jobs on jobs.id = uploads.job_id where jobs.format in ${sql(formats)} and uploads.cleanup_state in ('pending', 'running', 'waiting_capability_expiry')) as \"documentCleanupUploads\",",
            '    (select count(*)::int from dictionary_document_object_versions as versions join dictionary_document_uploads as uploads on uploads.id = versions.upload_id join dictionary_generation_jobs as jobs on jobs.id = uploads.job_id where jobs.format in ${sql(formats)} and versions.kind = \'tombstone\' and versions.deleted_at is null) as "documentTombstoneVersions",',
            '    (select count(*)::int from dictionary_document_uploads as uploads join dictionary_generation_jobs as jobs on jobs.id = uploads.job_id where jobs.format in ${sql(formats)} and uploads.capability_expires_at > now()) as "documentActiveCapabilities"`;',
            '  process.stdout.write(JSON.stringify(counts));',
            '} finally { await sql.end({ timeout: 1 }); }',
        ].join('\n');
        const result = await this.compose(
            files,
            `${this.projectPrefix}-${slot}`,
            [
                'exec',
                '--no-TTY',
                'dictionary-worker',
                'node',
                '--input-type=module',
                '--eval',
                source,
            ],
            slot,
            { capture: true },
        );
        let counts;
        try {
            counts = JSON.parse(result.stdout.trim());
        } catch {
            throw new Error(
                'Dictionary job retirement preflight returned an invalid result.',
            );
        }
        if (
            !Number.isSafeInteger(counts.queuedOrRunning) ||
            counts.queuedOrRunning < 0 ||
            !Number.isSafeInteger(counts.reviewableProposals) ||
            counts.reviewableProposals < 0 ||
            !Number.isSafeInteger(counts.documentAwaitingUploads) ||
            counts.documentAwaitingUploads < 0 ||
            !Number.isSafeInteger(counts.documentProcessingUploads) ||
            counts.documentProcessingUploads < 0 ||
            !Number.isSafeInteger(counts.documentCleanupUploads) ||
            counts.documentCleanupUploads < 0 ||
            !Number.isSafeInteger(counts.documentTombstoneVersions) ||
            counts.documentTombstoneVersions < 0 ||
            !Number.isSafeInteger(counts.documentActiveCapabilities) ||
            counts.documentActiveCapabilities < 0
        ) {
            throw new Error(
                'Dictionary job retirement preflight returned invalid counts.',
            );
        }
        const documentBlockers =
            counts.documentAwaitingUploads +
            counts.documentProcessingUploads +
            counts.documentCleanupUploads +
            counts.documentTombstoneVersions +
            counts.documentActiveCapabilities;
        if (
            counts.queuedOrRunning > 0 ||
            counts.reviewableProposals > 0 ||
            documentBlockers > 0
        ) {
            throw new Error(
                `Dictionary job formats cannot retire while ${counts.queuedOrRunning} queued/running jobs and ${counts.reviewableProposals} reviewable proposals remain; document blockers: ${counts.documentAwaitingUploads} awaiting uploads, ${counts.documentProcessingUploads} processing uploads, ${counts.documentCleanupUploads} cleanup uploads, ${counts.documentTombstoneVersions} retained tombstones, and ${counts.documentActiveCapabilities} active capabilities.`,
            );
        }
    }

    async verifyDictionaryWorkerDatabasePrivileges(slot) {
        if (this.environment !== 'production') return;
        const files = [
            path.join(this.composeDirectory, 'apps.compose.yaml'),
            path.join(this.composeDirectory, 'apps.production.compose.yaml'),
        ];
        const source = [
            "import postgres from 'postgres';",
            'const sql = postgres(process.env.DICTIONARY_WORKER_DATABASE_URL, { connect_timeout: 5, idle_timeout: 1, max: 1, onnotice: () => undefined });',
            'try {',
            `  const [privileges] = await sql.unsafe(${JSON.stringify(DICTIONARY_WORKER_DATABASE_PRIVILEGE_QUERY)});`,
            '  process.stdout.write(JSON.stringify(privileges));',
            '} finally { await sql.end({ timeout: 1 }); }',
        ].join('\n');
        const result = await this.compose(
            files,
            `${this.projectPrefix}-${slot}`,
            [
                'run',
                '--rm',
                '--no-deps',
                'dictionary-worker',
                'node',
                '--input-type=module',
                '--eval',
                source,
            ],
            slot,
            { capture: true },
        );
        let privileges;
        try {
            privileges = JSON.parse(result.stdout.trim());
        } catch {
            throw new Error(
                'Dictionary worker database privilege preflight returned an invalid result.',
            );
        }
        assertDictionaryWorkerDatabasePrivileges(privileges);
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

    async deploy({
        direction = 'forward',
        skipMigration = false,
        successOutcome = 'succeeded',
    } = {}) {
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
        let phase = 'preflight';
        let started = false;
        let switched = false;
        let committed = false;
        let migration = {
            outcome: 'not-run',
            ledger: this.manifest.migration.ledger,
        };
        try {
            assertDictionaryGenerationBudgetConfig(this.manifest, this.config);
            const retiringFormats = assertDictionaryJobRollbackCompatibility(
                this.manifest,
                state.current,
                { direction },
            );
            if (
                (
                    this.manifest.dictionaryJobs ??
                    EMPTY_DICTIONARY_JOB_CAPABILITIES
                ).workerProcessable.length > 0 &&
                this.config.DICTIONARY_GENERATION_PROVIDER_MODE !== 'mastra'
            ) {
                throw new Error(
                    'Worker-processable dictionary format support requires a configured live provider until queued work drains.',
                );
            }
            phase = 'retirement-preflight';
            await this.timed('retirementPreflightMs', () =>
                this.verifyDictionaryJobRetirement(
                    state.activeSlot,
                    retiringFormats,
                ),
            );
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
            // Replay is a mutating restore operation. An active slot shares this
            // database; its admin traffic and purge worker must not race replay.
            // Restore operators run the gate against a quiesced database before
            // any application traffic is restarted.
            if (!state.activeSlot) {
                phase = 'account-recovery-gate';
                await this.runAccountRecoveryGate(nextSlot);
            }
            phase = 'worker-database-privileges';
            await this.timed('workerDatabasePrivilegesMs', () =>
                this.verifyDictionaryWorkerDatabasePrivileges(nextSlot),
            );
            phase = 'start';
            await this.timed('startMs', () => this.startSlot(nextSlot));
            started = true;
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
            if (!committed && started && safeToStopNewSlot) {
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
            direction: 'rollback',
            skipMigration: true,
            successOutcome: 'rolled-back',
        });
    }
}
