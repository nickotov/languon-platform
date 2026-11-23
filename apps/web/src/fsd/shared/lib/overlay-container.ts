/** Keep floating UI in the same visible workspace view or native dialog as its trigger. */
export function overlayContainer(
    anchor: Element | null | undefined,
): HTMLElement {
    return (
        anchor?.closest<HTMLElement>(
            'dialog[open], [data-panel-overlay-root]',
        ) ?? document.body
    );
}
