/** Layout owns paragraph breaks; keep every original intra-paragraph separator. */
export function readingFragment(original: string) {
    const text = original.trim();
    // String lengths deliberately use UTF-16, matching the selection contract.
    const offsetOrigin = original.length - original.trimStart().length;
    return {
        text,
        offsetOrigin,
        leading: original.slice(0, offsetOrigin),
        trailing: original.slice(original.trimEnd().length),
    };
}
/** Strip structural paragraph-edge line breaks, preserving plain edge spaces. */
export function paragraphEdgeWhitespace(whitespace: string) {
    return /[\r\n]/u.test(whitespace) ? '' : whitespace;
}
