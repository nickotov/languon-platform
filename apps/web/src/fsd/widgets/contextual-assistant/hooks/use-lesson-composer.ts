import { useEffect, useRef, useState } from 'react';
import type { GenerationRunSummary } from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { useLessonRuns } from '@/fsd/features/lesson-generation';
import type { WorkspaceAssistantProps } from '../types';
import { captureGenerationSource } from '../lib/capture-generation-source';

export function useLessonComposer({
    actorId,
    conversationId,
    request,
    reconciliations,
    activeTurnId,
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
    reconciliations: number;
    activeTurnId?: string | undefined;
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
        revision: number;
        acknowledgedUncertainTurnId?: string;
    } | null>(null);
    const consumed = useRef<unknown>(null);
    const state = useLessonRuns({
        actorId,
        conversationId: enabled ? conversationId : null,
        request,
        reconciliations,
        onChanged: refresh,
    });
    const selected =
        selection?.conversationId === conversationId
            ? state.runs.find(
                  (run) =>
                      run.id === selection.runId &&
                      run.state === 'paused' &&
                      run.revision === selection.revision &&
                      run.uncertainTurnId ===
                          selection.acknowledgedUncertainTurnId,
              )
            : undefined;
    const activeRun = state.runs.find(
        (run) =>
            (run.state === 'running' || run.automation?.enabled) &&
            (!activeTurnId || run.activeTurnId === activeTurnId),
    );

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
        if (activeTurnId || run.state !== 'paused') {
            return;
        }

        setSelection({
            conversationId: run.conversationId,
            runId: run.id,
            revision: run.revision,
            ...(run.uncertainTurnId
                ? { acknowledgedUncertainTurnId: run.uncertainTurnId }
                : {}),
        });

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
        if (activeTurnId || activeRun || state.actions.pending) {
            return;
        }

        if (selected) {
            const instruction = question.trim();
            if (instruction) {
                state.actions.execute({
                    kind: 'revise',
                    run: selected,
                    instruction,
                    ...(selection?.acknowledgedUncertainTurnId
                        ? {
                              acknowledgedUncertainTurnId:
                                  selection.acknowledgedUncertainTurnId,
                          }
                        : {}),
                });
            }

            return;
        }

        if (selection?.conversationId === conversationId) {
            // The selected plan or uncertainty changed while the learner typed.
            setSelection(null);

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
        stopRun() {
            if (activeRun) {
                state.actions.execute({ kind: 'stop', run: activeRun });
            }
        },
        captureSourceContext,
    };
}
