import { createHash } from 'node:crypto';

export function sourceRevision(...parts) {
    const hash = createHash('sha256');
    for (const part of parts) {
        hash.update(String(part));
        hash.update('\0');
    }
    return `sha256:${hash.digest('hex')}`;
}

export function packageScriptRevision(name, value) {
    return sourceRevision('package-script', name, value);
}

export function documentedCommandRevision(source) {
    return sourceRevision(
        'documented-command',
        source.path,
        source.command,
        source.executable,
        JSON.stringify(source.args),
        source.cwd,
    );
}
