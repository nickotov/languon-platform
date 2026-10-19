/** Parses SSE across arbitrary UTF-8/network boundaries; comments are heartbeats. */
export async function readEventStream(
    response: Response,
    onEvent: (event: { data: string; id?: string; event?: string }) => void,
    signal: AbortSignal,
) {
    if (!response.body) throw new Error('Missing event stream');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let data: string[] = [];
    let id: string | undefined;
    let event: string | undefined;
    function line(value: string) {
        if (!value) {
            if (data.length)
                onEvent({
                    data: data.join('\n'),
                    ...(id ? { id } : {}),
                    ...(event ? { event } : {}),
                });
            data = [];
            id = undefined;
            event = undefined;
            return;
        }
        if (value.startsWith(':')) return;
        const colon = value.indexOf(':');
        const field = colon < 0 ? value : value.slice(0, colon);
        const content =
            colon < 0 ? '' : value.slice(colon + 1).replace(/^ /u, '');
        if (field === 'data') data.push(content);
        if (field === 'id' && !content.includes('\0')) id = content;
        if (field === 'event') event = content;
    }
    function consume(final: boolean) {
        let index = 0;
        for (let cursor = 0; cursor < buffer.length; cursor += 1) {
            const character = buffer[cursor];
            if (character !== '\n' && character !== '\r') continue;
            if (character === '\r' && cursor === buffer.length - 1 && !final)
                break;
            line(buffer.slice(index, cursor));
            if (character === '\r' && buffer[cursor + 1] === '\n') cursor += 1;
            index = cursor + 1;
        }
        buffer = buffer.slice(index);
        if (buffer.length > 1_000_000)
            throw new Error('Event exceeds permitted size');
    }
    try {
        while (!signal.aborted) {
            const chunk = await reader.read();
            buffer += decoder.decode(chunk.value, { stream: !chunk.done });
            consume(chunk.done);
            if (chunk.done) break;
        }
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
