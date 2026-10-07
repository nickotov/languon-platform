// A navigation-scoped marker only; sentence content and capabilities are never stored.
let pendingExerciseId: string | null = null;
export function rememberPreviewTrigger(id: string) {
    pendingExerciseId = id;
}
export function restorePreviewTrigger() {
    if (!pendingExerciseId) return;
    const row = document.querySelector(
        `[data-sentence-id="${pendingExerciseId}"]`,
    );
    if (!row) return;
    const controls = Array.from(
        row.querySelectorAll<HTMLElement>('button,input'),
    );
    const button = controls.find(
        (node) => node.tagName === 'BUTTON' && node.getClientRects().length > 0,
    );
    (
        button ?? controls.find((node) => node.getClientRects().length > 0)
    )?.focus();
    pendingExerciseId = null;
}
