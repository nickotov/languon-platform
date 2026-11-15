import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import type { ExerciseActivityId } from '@languon/contracts';

/** Own the floating surface without making it part of the input's geometry. */
export function usePromptPickerOverlay({
    editor,
    open,
    onOpen,
    onClose,
    onPreviewOpenChange,
}: {
    editor: RefObject<Editor | null>;
    open: boolean;
    onOpen(): void;
    onClose(): void;
    onPreviewOpenChange?: ((open: boolean) => void) | undefined;
}) {
    const anchor = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const [slash, setSlash] = useState(false);
    const [preview, updatePreview] = useState<ExerciseActivityId | null>(null);
    const previewTrigger = useRef<HTMLElement | null>(null);
    const virtualAnchor = useMemo(
        () => ({
            getBoundingClientRect() {
                return (
                    (
                        anchor.current?.closest('form') ?? anchor.current
                    )?.getBoundingClientRect() ?? DOMRect.fromRect({})
                );
            },
            get contextElement() {
                return (
                    anchor.current?.closest('form') ??
                    anchor.current ??
                    undefined
                );
            },
        }),
        [],
    );

    useEffect(() => {
        if (!open) {
            setSlash(false);
        }
    }, [open]);

    function openFromSlash() {
        setSlash(true);
        onOpen();
    }

    function dismiss() {
        onClose();
    }

    function close() {
        onClose();
        editor.current?.view.focus();
    }

    function setPreview(id: ExerciseActivityId | null) {
        updatePreview(id);
        onPreviewOpenChange?.(Boolean(id));
    }

    function navigate(direction: 'ArrowDown' | 'ArrowUp') {
        const items = Array.from(
            panel.current?.querySelectorAll<HTMLElement>(
                '[data-command-item]:not(:disabled)',
            ) ?? [],
        ).filter((item) => !item.closest('[hidden]'));
        const item = direction === 'ArrowUp' ? items.at(-1) : items[0];
        item?.focus({ preventScroll: true });
        item?.scrollIntoView({ block: 'nearest' });
    }

    function resume(text: string) {
        onClose();
        const instance = editor.current;
        if (instance) {
            instance
                .chain()
                .focus()
                .insertContent({ type: 'text', text })
                .run();
        }
    }

    function showPreview(id: ExerciseActivityId) {
        previewTrigger.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        setPreview(id);
    }

    function closePreview() {
        setPreview(null);
        requestAnimationFrame(() =>
            previewTrigger.current?.focus({ preventScroll: true }),
        );
    }

    return {
        anchor,
        panel,
        slash,
        preview,
        setPreview,
        virtualAnchor,
        openFromSlash,
        dismiss,
        close,
        navigate,
        resume,
        showPreview,
        closePreview,
    };
}
