import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
    ConversationActionQuoteSchema,
    type ConversationActionQuote,
    type GenerationRunSummary,
    type ConversationEditorContext,
} from '@languon/contracts';
import {
    conversationApi,
    ConversationApiError,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { lessonRunsApi } from '../api/lesson-runs-api';

export type LessonRunAction =
    | { kind: 'continue' | 'stop' | 'discard'; run: GenerationRunSummary }
    | { kind: 'revise'; run: GenerationRunSummary; instruction: string }
    | { kind: 'applyRevision'; run: GenerationRunSummary; candidateId: string }
    | {
          kind: 'resolveSource';
          run: GenerationRunSummary;
          choice: 'keep-snapshot' | 'refresh';
          sourceId?: string;
          editorContext?: ConversationEditorContext;
      };

export function useLessonRunActions(
    request: ConversationSessionRequest,
    refresh: () => Promise<void>,
    scope: string,
) {
    const currentScope = useRef(scope);
    const pending = useRef<{ signature: string; requestId: string } | null>(
        null,
    );
    const locked = useRef(false);
    const [quote, setQuote] = useState<ConversationActionQuote | null>(null);
    const mutation = useMutation({
        mutationFn: async ({
            action,
            confirmedQuoteId,
        }: {
            action: LessonRunAction;
            scope: string;
            confirmedQuoteId?: string;
        }) => {
            const signature = JSON.stringify(action);
            if (pending.current?.signature !== signature) {
                pending.current = { signature, requestId: crypto.randomUUID() };
            }

            const run = action.run;
            const common = {
                requestId: pending.current.requestId,
                expectedRevision: run.revision,
            };
            const args = [request, run.conversationId, run.id] as const;
            switch (action.kind) {
                case 'continue':
                    return lessonRunsApi.continue(...args, {
                        ...common,
                        ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
                    });
                case 'revise':
                    return lessonRunsApi.revise(...args, {
                        ...common,
                        instruction: action.instruction,
                        ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
                    });
                case 'applyRevision':
                    return lessonRunsApi.applyRevision(...args, {
                        ...common,
                        candidateId: action.candidateId,
                    });
                case 'resolveSource':
                    return lessonRunsApi.resolveSource(...args, {
                        ...common,
                        choice: action.choice,
                        ...(action.sourceId && action.editorContext
                            ? {
                                  sourceId: action.sourceId,
                                  editorContext: action.editorContext,
                              }
                            : {}),
                    });
                case 'discard':
                    return lessonRunsApi.discard(...args, common);
                case 'stop': {
                    if (!run.activeTurnId) {
                        throw new Error('No active lesson action.');
                    }

                    return request((token) =>
                        conversationApi.stop(
                            token,
                            run.conversationId,
                            run.activeTurnId!,
                        ),
                    );
                }
            }
        },
        onSuccess: async (_result, variables) => {
            if (variables.scope !== currentScope.current) {
                return;
            }

            pending.current = null;
            setQuote(null);
            await refresh();
        },
        onError: (error, variables) => {
            if (variables.scope !== currentScope.current) {
                return;
            }

            const nextQuote = readQuote(error);
            setQuote(nextQuote);
            if (!nextQuote) {
                void refresh();
            }
        },
        onSettled: (_data, _error, variables) => {
            if (variables.scope === currentScope.current) {
                locked.current = false;
            }
        },
    });

    const reset = mutation.reset;
    useEffect(() => {
        currentScope.current = scope;
        pending.current = null;
        locked.current = false;
        setQuote(null);
        reset();
    }, [scope, reset]);

    function execute(action: LessonRunAction) {
        if (locked.current || mutation.isPending) {
            return;
        }

        locked.current = true;
        setQuote(null);
        mutation.mutate({ action, scope });
    }

    function confirm() {
        if (
            !quote ||
            !mutation.variables ||
            locked.current ||
            mutation.isPending
        ) {
            return;
        }

        locked.current = true;
        mutation.mutate({
            action: mutation.variables.action,
            scope,
            confirmedQuoteId: quote.id,
        });
    }

    function cancelQuote() {
        if (locked.current || mutation.isPending) {
            return;
        }

        setQuote(null);
        pending.current = null;
        mutation.reset();
    }

    return {
        execute,
        confirm,
        cancelQuote,
        clearError: mutation.reset,
        quote,
        pending: mutation.isPending,
        action: mutation.variables?.action,
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
