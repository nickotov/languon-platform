import { useMemo, useRef, useState } from 'react';
import {
    isLessonPartPresent,
    type KnowledgeContentProposal,
    type LessonCopy,
} from '@languon/contracts';
import { ConversationApiError } from '@/fsd/entities/conversation';
import { contentProposalsApi } from '../api/content-proposals-api';
import type { KnowledgeContentProposalContext } from '../ui/content-proposals/knowledge-content-proposals';
import {
    pendingLessonCopy,
    rememberLessonCopy,
} from '../lib/lesson-copy-intent';

type LessonPlacement = 'cursor' | 'end';
type LessonInsertStatus = {
    taskId: LessonCopy['taskId'];
    placement: LessonPlacement;
};

export function useInsertLessonCopy({
    proposal,
    context,
    disabled,
    onApplied,
}: {
    proposal: KnowledgeContentProposal;
    context: KnowledgeContentProposalContext;
    disabled: boolean;
    onApplied(): void;
}) {
    const [busy, setBusy] = useState(false);
    const [failureReason, setFailureReason] = useState<
        'changed' | 'cursor' | 'failed' | null
    >(null);
    const [lessonInsertStatus, setLessonInsertStatus] =
        useState<LessonInsertStatus | null>(null);
    const [rejectedVersion, setRejectedVersion] = useState<number | null>(null);
    const lock = useRef(false);
    const wrongBranch = proposal.branchId !== context.branchId;
    const awaitingNewerDraft =
        rejectedVersion !== null && context.branchVersion <= rejectedVersion;

    const presentTasks = useMemo(() => {
        const present = new Set<string>();
        for (const part of proposal.lessonParts ?? []) {
            const inDocument =
                context.workingDocument && !wrongBranch
                    ? isLessonPartPresent(
                          proposal.id,
                          part,
                          proposal.body,
                          context.workingDocument,
                      )
                    : part.present;

            if (inDocument) {
                present.add(part.taskId);
            }
        }

        return present;
    }, [proposal, context.workingDocument, wrongBranch]);
    const hasMissingParts =
        presentTasks.size < (proposal.lessonParts?.length ?? 0);

    async function refreshLessonDraft() {
        if (
            lock.current ||
            disabled ||
            !context.refreshLessonDraft ||
            !awaitingNewerDraft ||
            wrongBranch
        ) {
            return;
        }

        lock.current = true;
        setBusy(true);
        try {
            await context.refreshLessonDraft();
        } catch {
            setFailureReason('changed');
        } finally {
            setBusy(false);
            lock.current = false;
        }
    }

    async function insertLesson(
        taskId: LessonCopy['taskId'],
        placement: LessonPlacement,
    ) {
        if (lock.current || disabled || wrongBranch || awaitingNewerDraft) {
            return;
        }

        const key = [
            'languon:lesson-copy',
            context.conversationId,
            proposal.id,
            context.branchId,
            taskId === undefined ? 'all' : `task-${taskId}`,
            placement,
        ].join(':');

        if (!hasMissingParts || (taskId && presentTasks.has(taskId))) {
            return;
        }

        const bookmark =
            placement === 'cursor' ? context.captureInsertion?.() : null;

        setLessonInsertStatus(null);
        setFailureReason(null);
        const pending = pendingLessonCopy(key, taskId);
        if (placement === 'cursor' && !bookmark && !pending) {
            setFailureReason('cursor');

            return;
        }

        lock.current = true;
        setBusy(true);
        context.onApplyingChange?.(true);
        let acknowledged = false;
        let submittedVersion: number | null = null;
        try {
            const branch = await context.beforeApply();
            if (branch.branchId !== proposal.branchId) {
                setFailureReason('changed');

                return;
            }

            // A receipt belongs to one draft revision. An edit or removal may
            // have superseded an acknowledged insertion while the tab was offline.
            const replay = pending?.version === branch.version ? pending : null;
            const position = replay ? replay.position : bookmark?.resolve();
            if (
                position === null ||
                (placement === 'cursor' && position === undefined)
            ) {
                setFailureReason('cursor');

                return;
            }

            const intent = replay ?? {
                requestId: crypto.randomUUID(),
                version: branch.version,
                position,
            };

            rememberLessonCopy(key, intent);
            submittedVersion = intent.version;
            const result = await contentProposalsApi.apply(
                context.requestWithSession,
                context.conversationId,
                proposal.id,
                intent.version,
                'insert-lesson',
                intent.position,
                { requestId: intent.requestId, taskId },
            );

            acknowledged = true;
            await context.onApplied(result.branch);
            rememberLessonCopy(key, null);
            setLessonInsertStatus({ taskId, placement });
            onApplied();
        } catch (failure) {
            if (
                !acknowledged &&
                failure instanceof ConversationApiError &&
                (failure.status === 400 ||
                    failure.status === 409 ||
                    failure.status === 422)
            ) {
                rememberLessonCopy(key, null);
            }

            const code =
                failure instanceof ConversationApiError
                    ? failure.detail.code
                    : null;

            if (
                !acknowledged &&
                code === 'version_conflict' &&
                submittedVersion !== null
            ) {
                setRejectedVersion(submittedVersion);
                // Reload once. The user chooses placement again against the reconciled draft.
                await context.refreshLessonDraft?.().catch(() => undefined);
            }

            setFailureReason(
                code === 'invalid_insertion_position'
                    ? 'cursor'
                    : code === 'version_conflict'
                      ? 'changed'
                      : 'failed',
            );
        } finally {
            bookmark?.release();
            context.onApplyingChange?.(false);
            setBusy(false);
            lock.current = false;
        }
    }

    return {
        busy,
        error: failureReason !== null,
        cursorUnavailable: failureReason === 'cursor',
        isStale: failureReason === 'changed',
        wrongBranch,
        lessonInsertStatus,
        insertLesson,
        refreshLessonDraft,
        canRefreshLessonDraft:
            awaitingNewerDraft &&
            !wrongBranch &&
            Boolean(context.refreshLessonDraft),
        canInsertLesson:
            !disabled && !wrongBranch && !awaitingNewerDraft && hasMissingParts,
        isPartPresent: (taskId: string) => presentTasks.has(taskId),
        canInsertLessonAtCursor:
            !wrongBranch && Boolean(context.captureInsertion),
    };
}
