import {
    ApplyKnowledgeContentProposalRequestSchema,
    type LessonCopy,
} from '@languon/contracts';

type LessonCopyIntent = {
    requestId: string;
    version: number;
    position?: number | undefined;
};
const memory = new Map<string, LessonCopyIntent>();

// Keep only placement and operation identity. The server owns the canonical content.
// An ambiguous timeout survives closing the review or reloading the tab.
export function rememberLessonCopy(
    key: string,
    intent: LessonCopyIntent | null,
) {
    if (intent) {
        memory.set(key, intent);
    } else {
        memory.delete(key);
    }

    try {
        if (intent) {
            sessionStorage.setItem(key, JSON.stringify(intent));
        } else {
            sessionStorage.removeItem(key);
        }
    } catch {
        // Browsers can disable storage. In-session retries still reuse the memory entry.
    }
}

export function pendingLessonCopy(key: string, taskId: LessonCopy['taskId']) {
    const current = memory.get(key);
    if (current) {
        return current;
    }

    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) {
            return null;
        }

        const stored = JSON.parse(raw);
        const parsed = ApplyKnowledgeContentProposalRequestSchema.safeParse({
            mode: 'insert-lesson',
            expectedBranchVersion: stored.version,
            insertionPosition: stored.position,
            lessonCopy: { taskId, requestId: stored.requestId },
        });

        if (parsed.success && parsed.data.lessonCopy) {
            return {
                version: parsed.data.expectedBranchVersion,
                requestId: parsed.data.lessonCopy.requestId,
                position: parsed.data.insertionPosition,
            };
        }
    } catch {
        // Missing or unreadable browser state starts a new explicit action.
    }

    return null;
}
