import {
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    type ChangeEvent,
    type FormEvent,
    type KeyboardEvent,
} from 'react';

/** Owns textarea sizing, reference-picker focus restoration and native input shortcuts. */
export function useConversationComposerInput({
    question,
    contextOpen,
    canSend,
    workspace,
    onQuestion,
    onContext,
    onSend,
}: {
    question: string;
    contextOpen: boolean;
    canSend: boolean;
    workspace: boolean;
    onQuestion(value: string): void;
    onContext(): void;
    onSend(): void;
}) {
    const id = useId();
    const input = useRef<HTMLTextAreaElement>(null);
    const previous = useRef({ contextOpen, question });
    const hintId = `${id}-hint`;
    useEffect(() => {
        if (
            (previous.current.contextOpen && !contextOpen) ||
            (!previous.current.question && question)
        )
            input.current?.focus({ preventScroll: true });
        previous.current = { contextOpen, question };
    }, [contextOpen, question]);
    useLayoutEffect(() => {
        const node = input.current;
        if (!node) return;
        node.style.height = 'auto';
        const height = workspace
            ? Math.min(node.scrollHeight, 160)
            : node.scrollHeight;
        node.style.height = `${height}px`;
    }, [question, workspace]);
    function change(event: ChangeEvent<HTMLTextAreaElement>) {
        onQuestion(event.target.value);
    }
    function key(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSend();
        }
        const before = question.slice(0, event.currentTarget.selectionStart);
        if (event.key === '/' && (!before || /\s$/.test(before))) {
            event.preventDefault();
            onContext();
        }
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        if (canSend) onSend();
    }
    return { id, input, hintId, change, key, submit };
}
