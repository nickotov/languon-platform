import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { usePreparedPracticeLaunch } from '../src/fsd/widgets/dictionary-training/hooks/use-prepared-practice-launch';

const batch = '10000000-0000-4000-8000-000000000001';
const manifest = { id: batch, preparedEntryIds: ['entry'] };

it.each(['mode', 'direction'] as const)(
    'starts only the latest prepared session when %s changes during load',
    async (field) => {
        const previous = Promise.withResolvers<typeof manifest>();
        const next = Promise.withResolvers<typeof manifest>();
        const load = vi
            .fn()
            .mockReturnValueOnce(previous.promise)
            .mockReturnValueOnce(next.promise);
        const start = vi.fn();
        const search = new URLSearchParams({
            practice: 'prepared',
            batch,
            direction: 'source-to-target',
            mode: 'saved-first',
        });
        const hook = renderHook(
            (query) =>
                usePreparedPracticeLaunch({
                    search: query,
                    start,
                    load,
                    enabled: true,
                }),
            { initialProps: search },
        );
        const updated = new URLSearchParams(search);
        updated.set(field, field === 'mode' ? 'new-only' : 'target-to-source');
        hook.rerender(updated);
        await act(async () => next.resolve(manifest));
        // The superseded request can either succeed or fail after the replacement.
        await act(async () => {
            if (field === 'mode') {
                previous.resolve(manifest);
            } else {
                previous.reject(new Error('superseded'));
            }
        });

        hook.rerender(new URLSearchParams(updated));

        expect(load).toHaveBeenCalledTimes(2);
        expect(start).toHaveBeenCalledTimes(1);
        expect(start).toHaveBeenCalledWith({
            preparedBatchId: batch,
            mode: updated.get('mode'),
            direction: updated.get('direction'),
            scope: { type: 'manual', entryIds: manifest.preparedEntryIds },
        });

        expect(hook.result.current).toBe(false);
    },
);
