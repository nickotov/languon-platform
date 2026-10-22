/** Bounded durable event batching; timers never leave an unhandled write rejection. */
export function createTurnTextBuffer(
    append: (text: string) => Promise<void>,
    onError: (error: unknown) => void,
) {
    let text = '';
    let bytes = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = Promise.resolve();
    let failure: unknown;
    const clear = () => {
        clearTimeout(timer);
        timer = undefined;
    };
    const flush = async () => {
        clear();
        if (text) {
            const batch = text;
            text = '';
            bytes = 0;
            pending = pending.then(async () => {
                if (failure) throw failure;
                await append(batch);
            });
            // Attach the handler immediately, including when a caller awaits flush.
            void pending.catch((error: unknown) => {
                failure = error;
                onError(error);
            });
        }
        await pending;
        if (failure) throw failure;
    };
    return {
        async append(delta: string) {
            if (failure) throw failure;
            // Iterate Unicode scalar values so a UTF-8 character is never split.
            for (const character of delta) {
                const size = Buffer.byteLength(character, 'utf8');
                if (bytes + size > 4096) await flush();
                text += character;
                bytes += size;
                if (!timer)
                    timer = setTimeout(() => {
                        void flush().catch(() => undefined);
                    }, 100);
            }
            if (bytes >= 4096) await flush();
        },
        flush,
        dispose: clear,
    };
}
