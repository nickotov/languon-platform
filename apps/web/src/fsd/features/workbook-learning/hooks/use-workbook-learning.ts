import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    KnowledgeBody,
    LearningBlock,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import type {
    LearningAnswer,
    LearningBlockViewProps,
    LearningInteraction,
} from '@/fsd/entities/learning-blocks';
import { useExerciseEvaluation } from './use-exercise-evaluation';
import { learningApi } from '../api/learning-api';
import { attemptAnswer } from '../lib/attempt-answer';
import { learningLabels } from '../lib/labels';
import { useNoteAudio } from './use-note-audio';
import { privateExerciseView } from '../lib/private-exercise-view';
import { exerciseSource } from '../lib/exercise-source';

type SessionRequest = <T>(
    operation: (token: string) => Promise<T>,
) => Promise<T>;
type PendingWrite = { id: string; execute: () => Promise<unknown> };
export interface WorkbookLearningOptions {
    noteId: string;
    noteVersion: number;
    body?: KnowledgeBody | undefined;
    actorId: string | undefined;
    locale: string;
    requestWithSession: SessionRequest;
    access?: WorkbookLearningShareAccess | undefined;
    onAiRequest?:
        ((request: { id: string; prompt: string }) => void) | undefined;
}

/** Mount keyed by actor/note/access. Server owns revisions, evaluation and identity. */
export function useWorkbookLearning({
    noteId,
    noteVersion,
    body,
    actorId,
    locale,
    requestWithSession,
    access,
}: WorkbookLearningOptions) {
    const labels = learningLabels(locale);
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(0);
    const [failed, setFailed] = useState<PendingWrite[]>([]);
    const [localError, setLocalError] = useState(false);
    const query = useQuery({
        queryKey: [
            'workbook-learning',
            actorId,
            noteId,
            access?.kind,
            access?.locator,
            access?.key,
            noteVersion,
        ],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                learningApi.state(token, noteId, access, signal),
            ),
        enabled: Boolean(actorId),
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });
    const evaluation = useExerciseEvaluation({
        noteId,
        locale,
        requestWithSession,
        access,
        onCompleted: query.refetch,
    });
    const audioUrls = useNoteAudio({
        noteId,
        body,
        access,
        requestWithSession,
        actorId,
        unavailable: Boolean(actorId && query.isError),
    });
    const state = query.data;
    const versionMatches = state?.noteVersion === noteVersion;
    const ready = Boolean(actorId && state && versionMatches && !query.isError);
    async function run(write: PendingWrite) {
        setPending((count) => count + 1);
        try {
            await write.execute();
            setFailed((writes) =>
                writes.filter((item) => item.id !== write.id),
            );
            await query.refetch();
            await queryClient.invalidateQueries({
                queryKey: ['workbook-progress', actorId],
            });
        } catch {
            setFailed((writes) =>
                writes.some((item) => item.id === write.id)
                    ? writes
                    : [...writes, write],
            );
        } finally {
            setPending((count) => count - 1);
        }
    }
    function retry() {
        if (pending === 0) for (const write of failed) void run(write);
    }
    function reload() {
        setLocalError(false);
        void query.refetch();
    }
    function complete() {
        if (!ready || !state || pending) return;
        const input = {
            id: crypto.randomUUID(),
            noteVersion: state.noteVersion,
            completed: state.completion === null,
        };
        void run({
            id: input.id,
            execute: () =>
                requestWithSession((token) =>
                    learningApi.completion(token, noteId, input, access),
                ),
        });
    }
    function options(
        block: LearningBlock,
    ): Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'> {
        const source = exerciseSource(block, body);
        const revision = state?.exerciseRevisions.find(
            (item) => item.exerciseId === block.id,
        )?.revision;
        function submit(_id: string, answer: LearningAnswer) {
            if (!ready || !state || !revision || block.type !== 'exercise')
                return;
            try {
                const input = {
                    id: crypto.randomUUID(),
                    noteVersion: state.noteVersion,
                    exerciseId: block.id,
                    exerciseRevision: revision,
                    answer: attemptAnswer(block, answer),
                };
                void run({
                    id: input.id,
                    execute: () =>
                        requestWithSession((token) =>
                            learningApi.attempt(token, noteId, input, access),
                        ),
                });
            } catch {
                setLocalError(true);
            }
        }
        function evaluate(_id: string, answer: LearningAnswer) {
            if (!ready || !state || !revision || block.type !== 'exercise')
                return;
            try {
                void evaluation.run({
                    id: crypto.randomUUID(),
                    noteVersion: state.noteVersion,
                    exerciseId: block.id,
                    exerciseRevision: revision,
                    answer: attemptAnswer(block, answer),
                });
            } catch {
                setLocalError(true);
            }
        }
        function interaction(_id: string, event: LearningInteraction) {
            if (
                !ready ||
                !state ||
                event.kind === 'answer' ||
                event.kind === 'retry'
            )
                return;
            const input = {
                id: crypto.randomUUID(),
                noteVersion: state.noteVersion,
                blockId: block.id,
                ...(revision ? { exerciseRevision: revision } : {}),
                kind: event.kind,
            };
            void run({
                id: input.id,
                execute: () =>
                    requestWithSession((token) =>
                        learningApi.event(token, noteId, input, access),
                    ),
            });
        }
        let evaluationUnavailableReason: string | undefined;
        if (!actorId) evaluationUnavailableReason = labels.signIn;
        else if (!ready) evaluationUnavailableReason = labels.loading;
        return {
            interactionsDisabled: Boolean(actorId && !ready),
            ...(source.transcript ? { hintTranscript: source.transcript } : {}),
            ...(source.videoSource
                ? { hintVideoSource: source.videoSource }
                : {}),
            ...(source.audioAssetId
                ? { audioUrl: audioUrls[source.audioAssetId] }
                : {}),
            ...(block.type === 'audio' && block.assetId
                ? { audioUrl: audioUrls[block.assetId] }
                : {}),
            ...(ready ? { onInteraction: interaction } : {}),
            ...(ready && block.type === 'exercise' && revision
                ? {
                      onSubmitAttempt: submit,
                      attemptPending: pending > 0,
                  }
                : {}),
            ...(ready && block.type === 'exercise'
                ? { onEvaluate: evaluate }
                : {}),
            evaluationPending: evaluation.states[block.id]?.pending ?? false,
            evaluationUnavailableReason,
            ...(evaluation.states[block.id]?.failed
                ? { error: labels.aiError }
                : {}),
            ...privateExerciseView({
                blockId: block.id,
                revision,
                state,
                evaluated: evaluation.states[block.id]?.attempt,
                labels,
            }),
        };
    }
    return {
        labels,
        evaluationConsent: evaluation.consent,
        query,
        state,
        ready,
        signedIn: Boolean(actorId),
        stale: Boolean(state && !versionMatches),
        busy: pending > 0,
        hasError: failed.length > 0 || localError,
        canRetry: failed.length > 0,
        options,
        complete,
        retry,
        reload,
    };
}
