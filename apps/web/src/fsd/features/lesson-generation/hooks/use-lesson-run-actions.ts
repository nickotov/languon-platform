import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
    ConversationActionQuoteSchema,
    type ConversationActionQuote,
    type GenerationRunSummary,
} from '@languon/contracts';
import {
    ConversationApiError,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import {
    lessonActionReceipt,
    releaseLessonActionReceipt,
} from '../lib/lesson-action-receipt';
import type { LessonRunAction } from '../types';
import { dispatchLessonAction } from '../api/dispatch-lesson-action';

export function useLessonRunActions(
    request: ConversationSessionRequest,
    refresh: () => Promise<void>,
    scope: string,
    conversationId: string | null,
) {
    // Returning to the same conversation is a new UI owner. An older in-flight
    // command may settle its receipt, but cannot publish into this view.
    const owner = useMemo(
        () => ({ scope, conversationId }),
        [scope, conversationId],
    );
    const currentOwner = useRef<typeof owner | null>(owner);
    const pending = useRef<Awaited<
        ReturnType<typeof lessonActionReceipt>
    > | null>(null);
    const locked = useRef(false);
    const [quote, setQuote] = useState<ConversationActionQuote | null>(null);
    const [failures, setFailures] = useState<
        Record<string, { kind: LessonRunAction['kind']; error: Error }>
    >({});

    function clearFailure(run: GenerationRunSummary) {
        setFailures((current) => {
            const next = { ...current };
            delete next[failureKey(run)];

            return next;
        });
    }

    const mutation = useMutation({
        mutationFn: async ({
            action,
            confirmedQuoteId,
            owner: issuingOwner,
        }: {
            action: LessonRunAction;
            owner: typeof owner;
            confirmedQuoteId?: string;
        }) => {
            const receipt = await lessonActionReceipt(
                issuingOwner.scope,
                action,
            );

            if (
                currentOwner.current !== issuingOwner ||
                action.run.conversationId !== issuingOwner.conversationId
            ) {
                throw new Error('The selected conversation changed.');
            }

            pending.current = receipt;
            try {
                const result = await dispatchLessonAction(
                    request,
                    action,
                    receipt.requestId,
                    confirmedQuoteId,
                );

                releaseLessonActionReceipt(receipt);

                return result;
            } catch (error) {
                if (
                    error instanceof ConversationApiError &&
                    error.status < 500 &&
                    error.status !== 408 &&
                    !readQuote(error)
                ) {
                    releaseLessonActionReceipt(receipt);
                }

                throw error;
            }
        },
        onSuccess: async (_result, variables) => {
            if (variables.owner !== currentOwner.current) {
                return;
            }

            pending.current = null;
            setQuote(null);
            clearFailure(variables.action.run);
            await refresh();
        },
        onError: (error, variables) => {
            if (variables.owner !== currentOwner.current) {
                return;
            }

            const nextQuote = readQuote(error);
            setQuote(nextQuote);
            if (!nextQuote) {
                setFailures((current) => ({
                    ...current,
                    [failureKey(variables.action.run)]: {
                        kind: variables.action.kind,
                        error,
                    },
                }));

                void refresh();
            }
        },
        onSettled: (_data, _error, variables) => {
            if (variables.owner === currentOwner.current) {
                locked.current = false;
            }
        },
    });

    const reset = mutation.reset;
    useLayoutEffect(() => {
        currentOwner.current = owner;
        setFailures({});
        pending.current = null;
        locked.current = false;
        setQuote(null);
        reset();

        return () => {
            currentOwner.current = null;
        };
    }, [owner, reset]);

    function stopping(run: GenerationRunSummary) {
        const action = mutation.variables?.action;

        return (
            mutation.variables?.owner === owner &&
            (mutation.isPending || mutation.isSuccess) &&
            action?.kind === 'stop' &&
            action.run.id === run.id &&
            action.run.revision === run.revision &&
            action.run.activeTurnId === run.activeTurnId &&
            (run.state === 'running' || run.automation?.enabled === true)
        );
    }

    function execute(action: LessonRunAction, confirmedQuoteId?: string) {
        if (
            owner !== currentOwner.current ||
            action.run.conversationId !== conversationId ||
            (action.kind === 'stop' && stopping(action.run)) ||
            locked.current ||
            mutation.isPending
        ) {
            return;
        }

        locked.current = true;
        setQuote(null);
        mutation.mutate({
            action,
            owner,
            ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
        });
    }

    function confirm() {
        if (
            !quote ||
            mutation.variables?.owner !== owner ||
            mutation.variables?.action.run.conversationId !== conversationId ||
            locked.current ||
            mutation.isPending
        ) {
            return;
        }

        locked.current = true;
        mutation.mutate({
            action: mutation.variables.action,
            owner,
            confirmedQuoteId: quote.id,
        });
    }

    function cancelQuote() {
        if (locked.current || mutation.isPending) {
            return;
        }

        setQuote(null);
        if (pending.current) {
            releaseLessonActionReceipt(pending.current);
        }

        pending.current = null;
        mutation.reset();
    }

    return {
        execute,
        stopping,
        confirm,
        cancelQuote,
        clearError: clearFailure,
        failureFor: (run: GenerationRunSummary) => failures[failureKey(run)],
        quote,
        pending: mutation.isPending,
        action:
            mutation.variables?.owner === owner
                ? mutation.variables.action
                : undefined,
        accepted: mutation.isSuccess ? mutation.variables.action : null,
        error: quote ? null : mutation.error,
    };
}

function readQuote(error: unknown) {
    if (
        !(error instanceof ConversationApiError) ||
        error.detail.code !== 'action_confirmation_required'
    ) {
        return null;
    }

    const detail = error.detail;
    const candidate =
        'details' in detail &&
        detail.details &&
        typeof detail.details === 'object' &&
        'quote' in detail.details
            ? detail.details.quote
            : null;
    const parsed = ConversationActionQuoteSchema.safeParse(candidate);

    return parsed.success ? parsed.data : null;
}

function failureKey(run: GenerationRunSummary) {
    // A command error belongs to the state in which the owner issued it. A
    // winning command in another tab can advance the same plan revision.
    return [
        run.conversationId,
        run.id,
        run.revision,
        run.state,
        run.pauseReason,
        run.activeTurnId,
        run.lastCommandRequestId,
    ].join(':');
}
