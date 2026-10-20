/** Source geometry uses a 440px cap at the app's 16px reference root size. */
export function inlineProposalPosition(
    root: { top: number; left: number; width: number },
    last: { left: number; bottom: number },
    rootFontSize = 16,
): { top: number; left: number; width: number } {
    const unit = rootFontSize / 16;
    const width = Math.min(440 * unit, root.width + 16 * unit);
    const left = Math.max(
        -8 * unit,
        Math.min(
            last.left - root.left - 12 * unit,
            root.width - width + 8 * unit,
        ),
    );
    return { top: last.bottom - root.top + 8 * unit, left, width };
}
