import { createHash } from 'node:crypto';

/** Stable across workers/restarts, so a queue retry cannot create another stage. */
export function automaticRequestId(value: string): string {
    const digest = createHash('sha256').update(value).digest('hex');

    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function recordingAdmissionRequestId(runId: string, revision: number) {
    return automaticRequestId(`recording:${runId}:${revision}`);
}
