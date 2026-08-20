import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assertDeployConfig, readDeployConfig } from './config.mjs';
import { readReleaseManifest } from './manifest.mjs';

const CONFIRMATION = 'admin-membership-change';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requiredString(value, name) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${name} is required.`);
    }
    return value.trim();
}

export function validateAdminOperatorRequest(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Admin operator request must be a JSON object.');
    }
    const allowedKeys = new Set([
        'action',
        'actorEmail',
        'confirm',
        'email',
        'reason',
    ]);
    for (const key of Object.keys(input)) {
        if (!allowedKeys.has(key))
            throw new Error(`Unknown request field ${key}.`);
    }
    const action = requiredString(input.action, 'action');
    if (!['grant', 'list', 'prune', 'revoke'].includes(action)) {
        throw new Error('action must be grant, revoke, list, or prune.');
    }
    if (action === 'list') {
        if (Object.keys(input).some((key) => key !== 'action')) {
            throw new Error('The list action does not accept mutation fields.');
        }
        return { action };
    }
    if (input.confirm !== CONFIRMATION) {
        throw new Error(`confirm must be the literal ${CONFIRMATION}.`);
    }
    const actorEmail = input.actorEmail;
    if (actorEmail !== undefined && !EMAIL_PATTERN.test(actorEmail)) {
        throw new Error('actorEmail must be a valid email address.');
    }
    const reason = requiredString(input.reason, 'reason');
    if (reason.length < 5 || reason.length > 500) {
        throw new Error('reason must contain between 5 and 500 characters.');
    }
    if (action === 'prune') {
        if (!actorEmail) throw new Error('actorEmail is required for prune.');
        if (input.email !== undefined) {
            throw new Error('email is not accepted for prune.');
        }
        return {
            action,
            actorEmail,
            confirm: CONFIRMATION,
            reason,
        };
    }
    const email = requiredString(input.email, 'email');
    if (!EMAIL_PATTERN.test(email)) {
        throw new Error('email must be a valid email address.');
    }
    return {
        action,
        ...(actorEmail ? { actorEmail } : {}),
        confirm: CONFIRMATION,
        email,
        reason,
    };
}

function sameRelease(left, right) {
    return (
        left?.identity === right.identity &&
        left?.sourceSha === right.sourceSha &&
        Object.keys(right.images).every(
            (service) => left?.images?.[service] === right.images[service],
        )
    );
}

export async function runRemoteAdminOperator({
    configPath,
    environment,
    manifestPath,
    repositoryRoot,
    request,
    runner,
    stateDirectory,
}) {
    const manifest = await readReleaseManifest(manifestPath);
    const config = assertDeployConfig(
        environment,
        await readDeployConfig(configPath),
    );
    const statePath = path.join(stateDirectory, 'deployment-state.json');
    let state;
    try {
        state = JSON.parse(await readFile(statePath, 'utf8'));
    } catch (error) {
        throw new Error(
            `Cannot read active deployment state at ${statePath}.`,
            {
                cause: error,
            },
        );
    }
    if (!state.activeSlot || !state.current) {
        throw new Error('No active deployment exists for the environment.');
    }
    if (!sameRelease(state.current, manifest)) {
        throw new Error(
            'The supplied manifest is not the active release. Refusing to run an operator command against an unverified image.',
        );
    }
    const projectPrefix =
        config.DEPLOY_PROJECT_PREFIX || `languon-${environment}`;
    const appEnvironment = environment === 'stage' ? 'staging' : 'production';
    const env = {
        ...process.env,
        ...config,
        ADMIN_IMAGE: manifest.images.admin,
        APP_ENV: appEnvironment,
        BACKEND_IMAGE: manifest.images.backend,
        DEPLOY_ENVIRONMENT: environment,
        DEPLOY_PROJECT_PREFIX: projectPrefix,
        DEPLOY_SLOT: state.activeSlot,
        MIGRATOR_IMAGE: manifest.images.migrator,
        RELEASE_SHA: manifest.sourceSha,
        WEB_IMAGE: manifest.images.web,
    };
    const composePath = path.join(
        repositoryRoot,
        'infra/deploy/compose/apps.compose.yaml',
    );
    const result = await runner(
        'docker',
        [
            'compose',
            '-f',
            composePath,
            '--project-name',
            `${projectPrefix}-${state.activeSlot}`,
            'run',
            '--rm',
            '--no-deps',
            '--no-TTY',
            'backend',
            'node',
            'dist/infrastructure/administration/admin-command.js',
            '--request-stdin',
        ],
        {
            capture: true,
            env,
            input: `${JSON.stringify(commandRequest(request))}\n`,
        },
    );
    return {
        action: request.action,
        environment,
        releaseIdentity: manifest.identity,
        sourceSha: manifest.sourceSha,
        output: result.stdout?.trim() || '',
    };
}

function commandRequest(request) {
    const { action, ...parameters } = request;
    return { command: action, ...parameters };
}
