import type { SpeechSource } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { speechApi } from './speech-api';
import { speechSourceKey } from '../model/speech-player';

type Pending = {
    source: SpeechSource;
    resolve(value: boolean): void;
    reject(reason: unknown): void;
};
const batches = new Map<RequestWithSession, Pending[]>();

/** Coalesce controls mounted together, limiting each authorized batch to 50 sources. */
export function speechAvailability(
    source: SpeechSource,
    request: RequestWithSession,
): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const pending = batches.get(request);
        const item = { source, resolve, reject };
        if (pending) {
            pending.push(item);
            return;
        }
        batches.set(request, [item]);
        queueMicrotask(() => {
            void flush(request);
        });
    });
}

async function flush(request: RequestWithSession) {
    const pending = batches.get(request) ?? [];
    batches.delete(request);
    const api = speechApi(request);
    for (let offset = 0; offset < pending.length; offset += 50) {
        const group = pending.slice(offset, offset + 50);
        try {
            const result = await api.availability(
                group.map((item) => item.source),
                AbortSignal.timeout(15_000),
            );
            const values = new Map(
                result.availability.map((item) => [
                    speechSourceKey(item.source),
                    item.playable,
                ]),
            );
            group.forEach((item) =>
                item.resolve(values.get(speechSourceKey(item.source)) === true),
            );
        } catch (error) {
            group.forEach((item) => item.reject(error));
        }
    }
}
