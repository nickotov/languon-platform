import {
    dictionaryAudioApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import { AudioUnavailableError } from '../lib/audio-playback';
import type { AudioSelection } from '../types';

function delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        const abort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
        }, ms);
        signal.addEventListener('abort', abort, { once: true });
    });
}

export async function prepareAudio(
    requestWithSession: RequestWithSession,
    dictionaryId: string,
    selection: AudioSelection,
    signal: AbortSignal,
) {
    signal = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    const { card, field } = selection;
    const deadline = Date.now() + 120_000;
    let response = await requestWithSession((token) =>
        dictionaryAudioApi.request(
            token,
            dictionaryId,
            card.id,
            {
                field,
                expectedCardVersion: card.version,
                expectedSettingsVersion: card.settingsVersion,
            },
            signal,
        ),
    );
    while (response.state === 'queued' || response.state === 'processing') {
        if (Date.now() >= deadline)
            throw new Error('Audio preparation timed out');
        await delay(
            Math.min(5_000, Math.max(500, response.retryAfterMs ?? 1000)),
            signal,
        );
        response = await requestWithSession((token) =>
            dictionaryAudioApi.status(
                token,
                dictionaryId,
                card.id,
                field,
                signal,
            ),
        );
    }
    if (
        response.state === 'unavailable' ||
        response.state === 'submission_unknown'
    )
        throw new AudioUnavailableError();
    if (response.state !== 'ready' || !response.assetId)
        throw new Error('Audio generation failed');
    const assetId = response.assetId;
    const blob = await requestWithSession((token) =>
        dictionaryAudioApi.bytes(
            token,
            dictionaryId,
            card.id,
            field,
            assetId,
            signal,
        ),
    );
    signal.throwIfAborted();
    return { blob, fixture: response.fixture };
}
