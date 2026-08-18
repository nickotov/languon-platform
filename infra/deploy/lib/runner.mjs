import { spawn } from 'node:child_process';

export async function runCommand(command, args, options = {}) {
    return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => (stdout += chunk));
        child.stderr?.on('data', (chunk) => (stderr += chunk));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) return resolve({ stdout, stderr });
            reject(
                new Error(`${command} exited with ${code}.`, {
                    cause: options.capture
                        ? new Error(stderr.trim())
                        : undefined,
                }),
            );
        });
    });
}

export function shellRunner(baseOptions = {}) {
    return (command, args, options = {}) =>
        runCommand(command, args, { ...baseOptions, ...options });
}
