import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { commandIsActive } from './catalog.mjs';
import { initialAgentMetadata, projectCodexEvent } from './codex-events.mjs';
import {
    BoundedLogBuffer,
    createEnvironmentRedactor,
    LineDecoder,
    sanitizeLogText,
    StreamingRedactor,
} from './logs.mjs';

export class PanelOperationError extends Error {
    constructor(code, message, { issues = [], status = 409 } = {}) {
        super(message);
        this.name = 'PanelOperationError';
        this.code = code;
        this.issues = issues;
        this.status = status;
    }
}

function terminalStatus(status) {
    return ['cancelled', 'failed', 'succeeded'].includes(status);
}

function snapshotRun(run) {
    if (!run) return null;
    return {
        agent: run.agent,
        commandId: run.commandId,
        endedAt: run.endedAt,
        exitCode: run.exitCode,
        id: run.id,
        logs: run.logs.snapshot(),
        signal: run.signal,
        startedAt: run.startedAt,
        status: run.status,
    };
}

function processSignal(run, signal) {
    const child = run.child;
    if (!child || child.pid === undefined) return;
    try {
        if (process.platform === 'win32') {
            if (child.exitCode === null) {
                child.kill(signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM');
            }
        } else {
            process.kill(-child.pid, signal);
        }
    } catch (error) {
        if (error.code !== 'ESRCH') throw error;
    }
}

function windowsTreeKill(run, force) {
    if (process.platform !== 'win32' || !run.child?.pid) return;
    const args = ['/PID', String(run.child.pid), '/T'];
    if (force) args.push('/F');
    const killer = spawn('taskkill.exe', args, {
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
    });
    killer.unref();
}

function forceOwnedTree(run) {
    if (process.platform === 'win32') windowsTreeKill(run, true);
    else processSignal(run, 'SIGKILL');
}

function commandConflictIssues(commands, activeRuns) {
    const selectedIds = new Set(commands.map(({ id }) => id));
    const issues = [];
    for (const command of commands) {
        for (const conflict of command.conflictsWith) {
            if (selectedIds.has(conflict) && command.id < conflict) {
                issues.push({
                    commandId: command.id,
                    reason: `conflicts with selected command '${conflict}'`,
                });
            }
            const active = activeRuns.get(conflict);
            if (commandIsActive(active)) {
                issues.push({
                    commandId: command.id,
                    reason: `conflicts with active command '${conflict}'`,
                });
            }
        }
    }
    return issues;
}

export class ProcessManager extends EventEmitter {
    #catalogStore;
    #environment;
    #runs = new Map();
    #serial = Promise.resolve();
    #shuttingDown = false;

    constructor({ catalogStore, environment = process.env }) {
        super();
        this.#catalogStore = catalogStore;
        this.#environment = { ...environment };
    }

    snapshot() {
        return Object.fromEntries(
            [...this.#runs.entries()].map(([commandId, run]) => [
                commandId,
                snapshotRun(run),
            ]),
        );
    }

    async startBatch(selections) {
        return this.#enqueue(() => this.#startBatch(selections));
    }

    async #startBatch(selections) {
        if (this.#shuttingDown) {
            throw new PanelOperationError(
                'server_shutting_down',
                'The panel server is shutting down.',
                { status: 503 },
            );
        }
        await this.#catalogStore.refresh();
        const issues = [];
        if (!Array.isArray(selections) || selections.length === 0) {
            issues.push({
                commandId: null,
                reason: 'select at least one command',
            });
        }
        const uniqueIds = new Set();
        const commands = [];
        for (const selection of selections) {
            const commandId = selection?.id;
            if (uniqueIds.has(commandId)) {
                issues.push({ commandId, reason: 'selected more than once' });
                continue;
            }
            uniqueIds.add(commandId);
            const command = this.#catalogStore.getCommand(commandId);
            if (!command) {
                issues.push({ commandId, reason: 'unknown command' });
                continue;
            }
            if (!command.available || !command.execution) {
                issues.push({
                    commandId,
                    reason: command.runtimeReason ?? 'command is disabled',
                });
                continue;
            }
            if (selection.sourceRevision !== command.actualRevision) {
                issues.push({
                    commandId,
                    reason: 'command source changed; refresh the panel before starting it',
                });
                continue;
            }
            const existing = this.#runs.get(commandId);
            if (commandIsActive(existing)) {
                issues.push({
                    commandId,
                    reason: 'command is already running',
                });
                continue;
            }
            commands.push(command);
        }
        issues.push(...commandConflictIssues(commands, this.#runs));
        if (issues.length > 0) {
            throw new PanelOperationError(
                'batch_invalid',
                'No commands were started because the selection is invalid.',
                { issues },
            );
        }

        const batchRuns = commands.map((command) => {
            const run = this.#createRun(command);
            this.#runs.set(command.id, run);
            this.#emitState(command.id);
            return { command, run };
        });

        const results = await Promise.allSettled(
            batchRuns.map(({ command, run }) => this.#spawn(command, run)),
        );
        const failed = results
            .map((result, index) => ({ result, ...batchRuns[index] }))
            .filter(({ result }) => result.status === 'rejected');
        if (failed.length > 0) {
            for (const { run } of batchRuns) {
                if (commandIsActive(run)) this.#requestStop(run);
            }
            throw new PanelOperationError(
                'batch_spawn_failed',
                'The batch could not start and its owned processes are stopping.',
                {
                    issues: failed.map(({ command }) => ({
                        commandId: command.id,
                        reason: 'process could not be spawned',
                    })),
                    status: 500,
                },
            );
        }
        return batchRuns.map(({ run }) => snapshotRun(run));
    }

    #createRun(command) {
        let resolveExit;
        const exitPromise = new Promise((resolve) => {
            resolveExit = resolve;
        });
        return {
            agent:
                command.outputProtocol === 'codex-jsonl'
                    ? initialAgentMetadata()
                    : null,
            child: null,
            commandId: command.id,
            decoders: [],
            endedAt: null,
            exitCode: null,
            exitPromise,
            finalized: false,
            id: randomUUID(),
            logs: new BoundedLogBuffer(),
            resolveExit,
            signal: null,
            startedAt: new Date().toISOString(),
            status: 'starting',
            stopRequested: false,
            timers: [],
        };
    }

    async #spawn(command, run) {
        const child = spawn(
            command.execution.executable === 'node'
                ? process.execPath
                : command.execution.executable,
            command.execution.args,
            {
                cwd: command.execution.cwd,
                detached: process.platform !== 'win32',
                env: this.#environment,
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        run.child = child;
        const redact = createEnvironmentRedactor(this.#environment);
        const append = (stream, rawText) => {
            const text = sanitizeLogText(rawText);
            const entry = run.logs.append({ stream, text });
            this.emit('log', { commandId: command.id, entry, runId: run.id });
        };
        const stdoutDecoder = new LineDecoder((line) => {
            if (command.outputProtocol !== 'codex-jsonl') {
                append('stdout', line);
                return;
            }
            const projected = projectCodexEvent(line, run.agent);
            if (projected.kind === 'metadata') {
                run.agent = projected.metadata;
                append('agent', projected.logText);
                this.emit('agent', {
                    agent: run.agent,
                    commandId: command.id,
                    runId: run.id,
                });
            }
        });
        let codexDiagnosticReported = false;
        const stderrDecoder = new LineDecoder((line) => {
            if (command.outputProtocol !== 'codex-jsonl') {
                append('stderr', line);
            } else if (!codexDiagnosticReported) {
                codexDiagnosticReported = true;
                append(
                    'agent',
                    '[codex] diagnostic output was suppressed to protect content',
                );
            }
        });
        const stdoutRedactor = new StreamingRedactor({
            onText: (text) => stdoutDecoder.writeText(text),
            redact,
        });
        const stderrRedactor = new StreamingRedactor({
            onText: (text) => stderrDecoder.writeText(text),
            redact,
        });
        run.decoders = [
            stdoutRedactor,
            stderrRedactor,
            stdoutDecoder,
            stderrDecoder,
        ];
        child.stdout.on('data', (chunk) => stdoutRedactor.write(chunk));
        child.stderr.on('data', (chunk) => stderrRedactor.write(chunk));

        child.once('exit', () => {
            // Descendants can keep inherited pipes open after their leader exits.
            // Terminate the owned tree here, then let `close` drain and finalize.
            forceOwnedTree(run);
        });

        child.once('close', (code, signal) => {
            this.#enqueue(async () => {
                if (run.finalized) return;
                run.finalized = true;
                stdoutRedactor.end();
                stderrRedactor.end();
                stdoutDecoder.end();
                stderrDecoder.end();
                for (const timer of run.timers) clearTimeout(timer);
                run.timers = [];
                run.endedAt = new Date().toISOString();
                run.exitCode = code;
                run.signal = signal;
                run.status = run.stopRequested
                    ? 'cancelled'
                    : code === 0
                      ? 'succeeded'
                      : 'failed';
                run.resolveExit(snapshotRun(run));
                this.#emitState(command.id);
            }).catch(() => {});
        });

        await new Promise((resolveSpawn, rejectSpawn) => {
            child.once('spawn', resolveSpawn);
            child.once('error', rejectSpawn);
        }).catch((error) => {
            run.finalized = true;
            stdoutRedactor.end();
            stderrRedactor.end();
            stdoutDecoder.end();
            stderrDecoder.end();
            append(
                'stderr',
                `Unable to start command (${error.code ?? 'spawn failed'}).`,
            );
            run.endedAt = new Date().toISOString();
            run.status = 'failed';
            run.resolveExit(snapshotRun(run));
            this.#emitState(command.id);
            throw error;
        });
        if (run.stopRequested) {
            this.#requestStop(run);
        } else {
            run.status = 'running';
            this.#emitState(command.id);
        }
    }

    async stop(commandId, runId) {
        return this.#enqueue(async () => {
            const run = this.#runs.get(commandId);
            if (!run) {
                throw new PanelOperationError(
                    'run_not_found',
                    'This command has no current run.',
                    {
                        issues: [{ commandId, reason: 'no current run' }],
                        status: 404,
                    },
                );
            }
            if (run.id !== runId) {
                throw new PanelOperationError(
                    'stale_run',
                    'This tab no longer refers to the current run.',
                    {
                        issues: [{ commandId, reason: 'run ID is stale' }],
                        status: 409,
                    },
                );
            }
            if (!terminalStatus(run.status)) this.#requestStop(run);
            return snapshotRun(run);
        });
    }

    async stopAll() {
        return this.#enqueue(async () => {
            const stopped = [];
            for (const run of this.#runs.values()) {
                if (!terminalStatus(run.status)) {
                    this.#requestStop(run);
                    stopped.push(snapshotRun(run));
                }
            }
            return stopped;
        });
    }

    #requestStop(run) {
        if (terminalStatus(run.status) || run.status === 'stopping') return;
        run.stopRequested = true;
        run.status = 'stopping';
        this.#emitState(run.commandId);
        if (process.platform === 'win32') windowsTreeKill(run, false);
        else processSignal(run, 'SIGTERM');
        const terminate = setTimeout(() => {
            if (process.platform === 'win32') windowsTreeKill(run, false);
            else processSignal(run, 'SIGTERM');
        }, 3000);
        const force = setTimeout(() => {
            forceOwnedTree(run);
        }, 6000);
        terminate.unref();
        force.unref();
        run.timers.push(terminate, force);
    }

    #emitState(commandId) {
        this.emit('state', {
            commandId,
            run: snapshotRun(this.#runs.get(commandId)),
        });
    }

    async shutdown() {
        this.#shuttingDown = true;
        await this.stopAll();
        const active = [...this.#runs.values()].filter((run) =>
            commandIsActive(run),
        );
        if (active.length === 0) return;
        await Promise.race([
            Promise.allSettled(active.map(({ exitPromise }) => exitPromise)),
            new Promise((resolve) => {
                const timeout = setTimeout(resolve, 7000);
                timeout.unref();
            }),
        ]);
    }

    #enqueue(operation) {
        const result = this.#serial.then(operation, operation);
        this.#serial = result.catch(() => {});
        return result;
    }
}
