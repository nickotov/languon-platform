import { describe, expect, it } from 'vitest';
import { readEventStream } from '../src/fsd/entities/conversation/lib/read-event-stream';

describe('readEventStream', () => {
    it('preserves Unicode and multiline events across every byte boundary', async () => {
        const bytes = new TextEncoder().encode(
            ': heartbeat\r\nid: 4\r\nevent: update\r\ndata: {"text":"日本語"}\r\ndata: second\r\n\r\n',
        );
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const byte of bytes)
                    controller.enqueue(new Uint8Array([byte]));
                controller.close();
            },
        });
        const received: unknown[] = [];
        await readEventStream(
            new Response(stream),
            (event) => received.push(event),
            new AbortController().signal,
        );
        expect(received).toEqual([
            { id: '4', event: 'update', data: '{"text":"日本語"}\nsecond' },
        ]);
    });
    it('does not dispatch an incomplete event at disconnect', async () => {
        const received: unknown[] = [];
        await readEventStream(
            new Response('data: partial\n'),
            (event) => received.push(event),
            new AbortController().signal,
        );
        expect(received).toEqual([]);
    });
});
