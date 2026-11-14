import {
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import type { SubmitConversationTurnRequest } from '@languon/contracts';
import type { PreparedExerciseRequest } from '@/fsd/features/knowledge-notes';

type ExerciseRequest = SubmitConversationTurnRequest['exerciseRequest'];

/** Picker choices remain explicit until the corresponding submitted turn is accepted. */
export function useExerciseComposer({
    conversationId,
    externalRequest,
    setQuestion,
    replaceReferences,
}: {
    conversationId: string | null;
    externalRequest?:
        { id: string; exercisePicker?: boolean | undefined } | undefined;
    setQuestion: Dispatch<SetStateAction<string>>;
    replaceReferences(ids: string[]): void;
}) {
    const [open, setOpen] = useState(false);
    const [request, setRequest] = useState<ExerciseRequest>();
    const lastExternal = useRef<string | null>(null);
    const previousPrompt = useRef<string | null>(null);
    const previousConversation = useRef(conversationId);

    useEffect(() => {
        if (
            previousConversation.current &&
            previousConversation.current !== conversationId
        ) {
            setRequest(undefined);
            setOpen(false);
            previousPrompt.current = null;
        }

        previousConversation.current = conversationId;
    }, [conversationId]);

    useEffect(() => {
        if (
            !externalRequest?.exercisePicker ||
            lastExternal.current === externalRequest.id
        ) {
            return;
        }

        lastExternal.current = externalRequest.id;
        setOpen(true);
    }, [externalRequest]);

    function show() {
        setOpen(true);
    }

    function close() {
        setOpen(false);
    }

    function clear() {
        setRequest(undefined);
    }

    function accepted(sent: ExerciseRequest) {
        setRequest((current) => (current === sent ? undefined : current));
    }

    function prepare(value: PreparedExerciseRequest) {
        setRequest(value.request);
        replaceReferences(value.blockIds);
        const previous = previousPrompt.current;
        setQuestion((current) => {
            const content = current.trimEnd();
            if (!content.trim() || content === previous) {
                return value.prompt;
            }

            const previousSuffix = previous ? `\n\n${previous}` : undefined;
            if (previousSuffix && content.endsWith(previousSuffix)) {
                return `${content.slice(0, -previousSuffix.length)}\n\n${value.prompt}`;
            }

            return `${content}\n\n${value.prompt}`;
        });

        previousPrompt.current = value.prompt;
        setOpen(false);
    }

    return { open, request, show, close, clear, accepted, prepare };
}
