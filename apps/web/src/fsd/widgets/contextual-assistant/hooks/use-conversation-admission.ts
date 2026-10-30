import { useMutation } from '@tanstack/react-query';
import {
    useRef,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import {
    ConversationActionQuoteSchema,
    type ConversationActionQuote,
    type ConversationTurn,
    type CopiedAttachment,
    type SubmitConversationTurnRequest,
} from '@languon/contracts';
import { ConversationApiError } from '@/fsd/entities/conversation';

type Submission = {
    content: string;
    blockReferences?: string[] | undefined;
    draftContext?: string | undefined;
    editorContext?: SubmitConversationTurnRequest['editorContext'];
    copiedAttachments?: CopiedAttachment[];
    retryOf?: string | undefined;
    confirmedQuoteId?: string | undefined;
    onAccepted?: ((turn: ConversationTurn) => void) | undefined;
};

export function useConversationAdmission({
    id,
    attachments,
    pendingRequest,
    submitTurn,
    setQuestion,
    setAttachments,
    refresh,
}: {
    id: string | null;
    attachments: CopiedAttachment[];
    pendingRequest: MutableRefObject<SubmitConversationTurnRequest | null>;
    submitTurn(
        input: SubmitConversationTurnRequest,
    ): Promise<{ turn: ConversationTurn }>;
    setQuestion: Dispatch<SetStateAction<string>>;
    setAttachments: Dispatch<SetStateAction<CopiedAttachment[]>>;
    refresh(id: string): Promise<void>;
}) {
    const confirmationLock = useRef(false);
    const submit = useMutation({
        mutationFn: async ({
            content,
            draftContext,
            editorContext,
            blockReferences,
            copiedAttachments,
            retryOf,
            confirmedQuoteId,
        }: Submission) => {
            if (!id) throw new Error('Conversation is unavailable.');
            const candidate = {
                content,
                attachments: copiedAttachments ?? attachments,
                draftContext: draftContext
                    ? { content: draftContext }
                    : undefined,
                editorContext,
                blockReferences: blockReferences ?? [],
                retryOf,
            };
            const signature = JSON.stringify(candidate);
            const previous = pendingRequest.current;
            if (
                !previous ||
                JSON.stringify({
                    ...previous,
                    requestId: undefined,
                    confirmedQuoteId: undefined,
                }) !== signature
            )
                pendingRequest.current = {
                    ...candidate,
                    requestId: crypto.randomUUID(),
                };
            const input = {
                ...pendingRequest.current!,
                ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
            };
            const response = await submitTurn(input);
            pendingRequest.current = null;
            return { ...response, sentAttachments: candidate.attachments };
        },
        onSettled: () => {
            confirmationLock.current = false;
        },
        onSuccess: async ({ turn, sentAttachments }, variables) => {
            setQuestion((current) =>
                current === variables.content ? '' : current,
            );
            const sentIds = new Set(sentAttachments.map((item) => item.id));
            setAttachments((current) =>
                current.filter((item) => !sentIds.has(item.id)),
            );
            variables.onAccepted?.(turn);
            await refresh(turn.conversationId);
        },
    });
    let quote: ConversationActionQuote | null = null;
    if (
        pendingRequest.current &&
        submit.error instanceof ConversationApiError &&
        submit.error.detail.code === 'action_confirmation_required'
    ) {
        const detail = submit.error.detail;
        if (
            'details' in detail &&
            detail.details &&
            typeof detail.details === 'object' &&
            'quote' in detail.details
        ) {
            const parsed = ConversationActionQuoteSchema.safeParse(
                detail.details.quote,
            );
            if (parsed.success) quote = parsed.data;
        }
    }
    function confirmQuote() {
        const input = pendingRequest.current;
        if (!quote || !input || submit.isPending || confirmationLock.current)
            return;
        confirmationLock.current = true;
        submit.mutate({
            content: input.content,
            copiedAttachments: input.attachments,
            draftContext: input.draftContext?.content,
            editorContext: input.editorContext,
            blockReferences: input.blockReferences,
            retryOf: input.retryOf,
            confirmedQuoteId: quote.id,
            onAccepted: submit.variables?.onAccepted,
        });
    }
    function cancelQuote() {
        if (submit.isPending) return;
        pendingRequest.current = null;
        submit.reset();
    }
    return { submit, quote, confirmQuote, cancelQuote };
}
