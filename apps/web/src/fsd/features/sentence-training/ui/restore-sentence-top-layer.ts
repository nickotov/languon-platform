/** Native fullscreen places the document above an already-open modal. Reinsert
 * only this practice modal without remounting its session or nested state. */
export function restoreSentenceTopLayer(dialog: HTMLDialogElement | null) {
    if (!dialog?.open || !document.fullscreenElement) return;
    const focused =
        document.activeElement instanceof HTMLElement &&
        dialog.contains(document.activeElement)
            ? document.activeElement
            : null;
    // A slow fullscreen grant can arrive after History or an exit confirmation
    // opened. Reinsert this subtree's active native modals in DOM nesting order
    // so that its innermost modal remains above practice and keeps its draft.
    const modals = [
        dialog,
        ...dialog.querySelectorAll<HTMLDialogElement>('dialog[open]'),
    ];
    for (const modal of modals) {
        // close() queues a native close event. Suppress exactly that refresh
        // transition so the shared Dialog does not treat it as a user exit.
        modal.addEventListener(
            'close',
            (event) => event.stopImmediatePropagation(),
            { once: true, capture: true },
        );
        modal.close();
        modal.showModal();
    }
    focused?.focus({ preventScroll: true });
}
