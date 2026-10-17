/** Native modal dialogs make body siblings inert, even in the popover top layer. */
export function overlayContainer(
    anchor: Element | null | undefined,
): HTMLElement {
    return anchor?.closest<HTMLDialogElement>('dialog[open]') ?? document.body;
}
