import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTurnTextBuffer } from './turn-text-buffer';

afterEach(() => vi.useRealTimers());

describe('durable turn text batching', () => {
    it('flushes small deltas at 100ms and flushes the final tail', async () => {
        vi.useFakeTimers();
        const append = vi.fn(async (_text: string) => {});
        const buffer = createTurnTextBuffer(append, vi.fn());
        await buffer.append('Hello');
        await buffer.append(' world');
        await vi.advanceTimersByTimeAsync(99);
        expect(append).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(append).toHaveBeenCalledExactlyOnceWith('Hello world');
        await buffer.append('!');
        await buffer.flush();
        expect(append.mock.calls.map(([text]) => text)).toEqual([
            'Hello world',
            '!',
        ]);
        buffer.dispose();
    });

    it('limits UTF-8 batches to 4KiB without breaking characters or write order', async () => {
        const batches: string[] = [];
        const buffer = createTurnTextBuffer(async (text) => {
            batches.push(text);
        }, vi.fn());
        const text = '🙂'.repeat(2300);
        await buffer.append(text);
        await buffer.flush();
        expect(batches.every((batch) => Buffer.byteLength(batch) <= 4096)).toBe(
            true,
        );
        expect(batches.join('')).toBe(text);
        expect(batches).toHaveLength(3);
        buffer.dispose();
    });

    it('reports timer failures and rejects subsequent writes', async () => {
        vi.useFakeTimers();
        const failure = new Error('operation fence lost');
        const onError = vi.fn();
        const buffer = createTurnTextBuffer(async () => {
            throw failure;
        }, onError);
        await buffer.append('partial');
        await vi.advanceTimersByTimeAsync(100);
        expect(onError).toHaveBeenCalledWith(failure);
        await expect(buffer.append('more')).rejects.toThrow('fence lost');
        await expect(buffer.flush()).rejects.toThrow('fence lost');
        buffer.dispose();
    });
});
