export function safeChatLink(value: string): string | undefined {
    try {
        const url = new URL(value);
        if (url.protocol === 'https:' || url.protocol === 'http:')
            return url.href;
    } catch {
        /* Relative and malformed links are not external evidence. */
    }
    return undefined;
}
