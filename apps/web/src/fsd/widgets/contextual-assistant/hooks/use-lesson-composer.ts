import { useEffect, useRef, useState } from 'react';
import type {
    ConversationDetail,
    GenerationRunSummary,
} from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { useLessonRuns } from '@/fsd/features/lesson-generation';
import type { WorkspaceAssistantProps } from '../types';
import { captureGenerationSource } from '../lib/capture-generation-source';

export function useLessonComposer({
    actorId,
    conversationId,
    request,
    detail,
    active,
    enabled,
    question,
    replaceQuestion,
    send,
    refresh,
    workspace,
}: {
    actorId: string;
    conversationId: string | null;
    request: ConversationSessionRequest;
    detail: ConversationDetail | undefined;
    active: boolean;
    enabled: boolean;
    question: string;
    replaceQuestion(value: string): void;
    send(): void;
    refresh(): Promise<void>;
    workspace?: WorkspaceAssistantProps | undefined;
}) {
    const composer = useRef<HTMLDivElement>(null);
    const [selection, setSelection] = useState<{
        conversationId: string;
        runId: string;
    } | null>(null);
    const consumed = useRef<unknown>(null);
    const revisionKey =
        detail?.turns
            .map((turn) => `${turn.id}:${turn.status}:${turn.updatedAt}`)
            .join(',') ?? '';
    const state = useLessonRuns({
        actorId,
        conversationId: enabled ? conversationId : null,
        request,
        active,
        revisionKey,
        onChanged: refresh,
    });
    const selected =
        selection?.conversationId === conversationId
            ? state.runs.find(
                  (run) => run.id === selection.runId && run.state === 'paused',
              )
            : undefined;
    const activeRun = state.runs.some((run) => run.state === 'running');

    useEffect(() => {
        const accepted = state.actions.accepted;
        if (
            !accepted ||
            consumed.current === accepted ||
            accepted.kind !== 'revise'
        ) {
            return;
        }

        consumed.current = accepted;
        setSelection(null);
        if (question === accepted.instruction) {
            replaceQuestion('');
        }
    }, [state.actions.accepted, question, replaceQuestion]);

    function adjust(run: GenerationRunSummary) {
        if (active || run.state !== 'paused') {
            return;
        }

        setSelection({ conversationId: run.conversationId, runId: run.id });
        window.requestAnimationFrame(() =>
            composer.current
                ?.querySelector<HTMLElement>(
                    '[contenteditable="true"], textarea',
                )
                ?.focus(),
        );
    }

    function cancelAdjustment() {
        setSelection(null);
    }

    async function captureSourceContext() {
        return workspace ? captureGenerationSource(workspace) : undefined;
    }

    function submit() {
        if (active || activeRun || state.actions.pending) {
            return;
        }

        if (selected) {
            const instruction = question.trim();
            if (instruction) {
                state.actions.execute({
                    kind: 'revise',
                    run: selected,
                    instruction,
                });
            }

            return;
        }

        send();
    }

    return {
        state,
        selected,
        adjust,
        cancelAdjustment,
        submit,
        composer,
        activeRun,
        captureSourceContext,
    };
}
