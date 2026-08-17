import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const mastraDevelopmentCommands = Object.freeze({
    infrastructure: ['docker', 'compose', 'up', '-d', '--wait', 'postgres'],
    playground: [
        'pnpm',
        '--filter',
        '@languon/backend',
        'mastra:playground:provision',
    ],
    promptWatch: ['pnpm', '--filter', '@languon/prompts', 'dev:mastra'],
    studio: [
        'pnpm',
        '--filter',
        '@languon/backend',
        'exec',
        'mastra',
        'dev',
        '--dir',
        'src/mastra',
        '--env',
        '../../.env.local',
        '--request-context-presets',
        'src/mastra/request-context-presets.json',
    ],
});

export async function runMastraDevelopmentHarness({
    cwd = repositoryRoot,
    environment = process.env,
} = {}) {
    const environmentFile = `${cwd}/.env.local`;
    if (!existsSync(environmentFile)) {
        throw new Error(
            '.env.local is required. Copy .env.example once and review the local playground settings.',
        );
    }

    loadEnvFile(environmentFile);
    const childEnvironment = {
        ...process.env,
        ...environment,
        MASTRA_AGENT_SIGNALS: 'false',
        MASTRA_AUTO_DETECT_URL: 'true',
        MASTRA_DEV_HARNESS: 'true',
        MASTRA_TELEMETRY_DISABLED: 'true',
    };

    await runToCompletion(mastraDevelopmentCommands.infrastructure, {
        cwd,
        environment: childEnvironment,
    });
    await runToCompletion(mastraDevelopmentCommands.playground, {
        cwd,
        environment: childEnvironment,
    });

    const promptWatch = startProcess(mastraDevelopmentCommands.promptWatch, {
        cwd,
        environment: childEnvironment,
    });
    const studio = startProcess(mastraDevelopmentCommands.studio, {
        cwd,
        environment: childEnvironment,
    });
    const children = [promptWatch.child, studio.child];
    let shuttingDown = false;

    function shutdown(signal = 'SIGTERM') {
        if (shuttingDown) return;
        shuttingDown = true;
        for (const child of children) {
            if (child.exitCode === null && child.signalCode === null) {
                child.kill(signal);
            }
        }
    }

    const onInterrupt = () => shutdown('SIGINT');
    const onTerminate = () => shutdown('SIGTERM');
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);

    try {
        const result = await Promise.race([
            promptWatch.completed,
            studio.completed,
        ]);
        shutdown();
        await Promise.allSettled([promptWatch.completed, studio.completed]);

        if (result.signal === null) {
            throw new Error(
                `${result.command} exited unexpectedly with code ${result.code}.`,
            );
        }
    } finally {
        process.removeListener('SIGINT', onInterrupt);
        process.removeListener('SIGTERM', onTerminate);
        shutdown();
    }
}

function startProcess(command, { cwd, environment }) {
    const [executable, ...args] = command;
    const child = spawn(executable, args, {
        cwd,
        env: environment,
        stdio: 'inherit',
    });
    const completed = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) =>
            resolve({
                code: code ?? (signal ? 1 : 0),
                command: command.join(' '),
                signal,
            }),
        );
    });
    return { child, completed };
}

async function runToCompletion(command, options) {
    const result = await startProcess(command, options).completed;
    if (result.code !== 0) {
        throw new Error(`${result.command} exited with code ${result.code}.`);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await runMastraDevelopmentHarness().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
