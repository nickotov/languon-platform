import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

// This is a terminal-only launcher, never a browser-controlled operation.
export async function restartExistingPanel({
    panelDirectory,
    port = 4400,
    run = execute,
    signal = (pid) => process.kill(pid, 'SIGTERM'),
    timeoutMs = 12_000,
    log = console.log,
    getUid = process.getuid,
}) {
    const directory = await realpath(panelDirectory);
    const runTool = async (command, args) => {
        try {
            const { stdout } = await run(command, args, {
                timeout: 2_000,
                maxBuffer: 64 * 1024,
            });
            return stdout.trim();
        } catch (error) {
            // Both tools exit 1 when their selector finds no process.
            if (
                error.code === 1 &&
                !error.stdout?.trim() &&
                !error.stderr?.trim()
            )
                return '';
            throw new Error(
                `Cannot safely inspect panel processes with ${command}.`,
                {
                    cause: error,
                },
            );
        }
    };
    const listeners = async () => {
        const output = await runTool('lsof', [
            '-nP',
            `-iTCP:${port}`,
            '-sTCP:LISTEN',
            '-t',
        ]);
        if (!output) return [];
        const pids = [...new Set(output.split(/\s+/u).map(Number))];
        if (pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 1))
            throw new Error('Cannot safely identify the panel listener.');
        return pids;
    };
    const identity = (pid) =>
        runTool('ps', ['-p', String(pid), '-o', 'uid=,lstart=,command=']);

    const pids = await listeners();
    if (pids.length === 0) return;
    const refuse = () => {
        throw new Error(
            `Port ${port} is occupied by a process that is not this checkout's panel; stop it manually.`,
        );
    };
    if (pids.length !== 1 || !getUid) refuse();
    const [pid] = pids;
    const before = await identity(pid);
    const match = /^(\d+)\s+(.{24})\s+(.+)$/u.exec(before);
    const entrypoint = resolve(directory, 'src/main.mjs');
    const commands = new Set(
        ['node', process.execPath].flatMap((node) => [
            `${node} src/main.mjs`,
            `${node} ${entrypoint}`,
        ]),
    );
    if (!match || Number(match[1]) !== getUid() || !commands.has(match[3]))
        refuse();
    const cwdOutput = await runTool('lsof', [
        '-a',
        '-p',
        String(pid),
        '-d',
        'cwd',
        '-Fn',
    ]);
    if (!cwdOutput.split('\n').includes(`n${directory}`)) refuse();

    // Revalidate after cwd inspection, so a process that exited/reused its PID
    // during inspection cannot intentionally become a restart target.
    if (!(await listeners()).includes(pid) || (await identity(pid)) !== before)
        throw new Error(
            'Panel process changed during inspection; retry dev:panel.',
        );
    log(
        'Restarting the existing web dev panel (including its owned commands)...',
    );
    try {
        signal(pid);
    } catch (error) {
        if (error.code !== 'ESRCH') throw error;
    }
    const deadline = Date.now() + timeoutMs;
    while ((await identity(pid)) === before) {
        if (Date.now() >= deadline)
            throw new Error(
                'Panel shutdown timed out; no replacement was started.',
            );
        await delay(100);
    }
}
