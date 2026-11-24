import type { LessonRunAction } from '../types';

type Receipt = { key?: string; requestId: string };
const memory = new Map<string, string>();

/** Keep an uncertain command replayable across navigation and same-tab reloads.
 * Only an opaque intent digest and UUID go into storage. */
export async function lessonActionReceipt(
    scope: string,
    action: LessonRunAction,
): Promise<Receipt> {
    // The scheduler's quote already identifies the resumable request across tabs.
    if (action.kind === 'continue' && action.run.recordingApproval) {
        return { requestId: action.run.recordingApproval.requestId };
    }

    const { run, ...intent } = action;
    const signature = JSON.stringify([
        scope,
        run.conversationId,
        run.id,
        run.revision,
        intent,
    ]);
    const bytes = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(signature),
    );
    const hash = Array.from(new Uint8Array(bytes), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
    const key = `lesson-command:${hash}`;
    let requestId = memory.get(key);
    try {
        const saved = sessionStorage.getItem(key);
        if (
            saved &&
            /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(saved)
        ) {
            requestId = saved;
        }
    } catch {
        // Private browsing can deny storage. In-memory retries remain idempotent.
    }

    // A later paused stage at the same plan revision is a new command only
    // when the server has durably acknowledged this exact previous request.
    if (requestId && requestId === run.lastCommandRequestId) {
        requestId = undefined;
    }

    requestId ??= crypto.randomUUID();
    memory.set(key, requestId);
    try {
        sessionStorage.setItem(key, requestId);
    } catch {
        // Same-tab reload recovery is available only when storage is permitted.
    }

    return { key, requestId };
}

export function releaseLessonActionReceipt(receipt: Receipt) {
    if (!receipt.key) {
        return;
    }

    if (memory.get(receipt.key) === receipt.requestId) {
        memory.delete(receipt.key);
    }

    try {
        if (sessionStorage.getItem(receipt.key) === receipt.requestId) {
            sessionStorage.removeItem(receipt.key);
        }
    } catch {
        // Storage was unavailable for this tab.
    }
}
