import { SpeechSourceSchema } from '@languon/contracts';
import type {
    SpeechQuote,
    SpeechResponse,
    SpeechSource,
} from '@languon/contracts';
import type { SpeechTransport } from '../api/speech-api';

export type SpeechPlayerState = {
    selection: string | null;
    phase:
        | 'idle'
        | 'loading'
        | 'confirmation'
        | 'playing'
        | 'ready'
        | 'failed'
        | 'unavailable';
    quote: SpeechQuote | null;
    fixture: boolean;
    requestId: string | null;
    billingState: SpeechResponse['billingState'];
};
const idle: SpeechPlayerState = {
    selection: null,
    phase: 'idle',
    quote: null,
    fixture: false,
    requestId: null,
    billingState: null,
};

export function speechSourceKey(source: SpeechSource) {
    return JSON.stringify(SpeechSourceSchema.parse(source));
}

function delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const cancel = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', cancel);
            resolve();
        }, ms);
        signal.addEventListener('abort', cancel, { once: true });
    });
}

/** A single browser coordinator fences every asynchronous continuation and owns Blob URLs. */
export class SpeechPlayer {
    private state: SpeechPlayerState = idle;
    private listeners = new Set<() => void>();
    private revision = 0;
    private abort: AbortController | null = null;
    private audio: HTMLAudioElement | null = null;
    private url: string | null = null;
    private transport: SpeechTransport | null = null;
    private confirmationOperation: string | null = null;
    subscribe = (callback: () => void) => {
        this.listeners.add(callback);
        return () => {
            this.listeners.delete(callback);
        };
    };
    snapshot = () => this.state;
    serverSnapshot = () => idle;
    private publish(patch: Partial<SpeechPlayerState>) {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((listener) => listener());
    }
    private clear() {
        ++this.revision;
        this.abort?.abort();
        this.abort = null;
        if (this.audio) {
            this.audio.onended = null;
            this.audio.onerror = null;
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
        }
        this.audio = null;
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = null;
    }
    reset = () => {
        this.clear();
        this.transport = null;
        this.confirmationOperation = null;
        this.publish(idle);
    };
    resetSelection(key: string) {
        if (this.state.selection === key) this.reset();
    }
    private async start(revision: number) {
        try {
            await this.audio?.play();
            if (revision === this.revision) this.publish({ phase: 'playing' });
        } catch (error) {
            if (revision === this.revision)
                this.publish({
                    phase:
                        error instanceof DOMException &&
                        error.name === 'NotAllowedError'
                            ? 'ready'
                            : 'failed',
                });
        }
    }
    async play(
        source: SpeechSource,
        transport: SpeechTransport,
        selectionKey = speechSourceKey(source),
    ) {
        const key = selectionKey;
        if (
            key === this.state.selection &&
            this.state.phase === 'ready' &&
            this.audio
        ) {
            await this.start(this.revision);
            return;
        }
        this.clear();
        this.transport = transport;
        this.confirmationOperation = null;
        this.publish({
            selection: key,
            phase: 'loading',
            quote: null,
            fixture: false,
            requestId: null,
            billingState: null,
        });
        const revision = this.revision;
        const abort = new AbortController();
        this.abort = abort;
        try {
            await this.resolve(
                await transport.prepare(source, abort.signal),
                transport,
                abort.signal,
                revision,
            );
        } catch {
            if (revision === this.revision) {
                this.clear();
                this.publish({ phase: 'failed', quote: null });
            }
        }
    }
    async confirm() {
        const quote = this.state.quote;
        const transport = this.transport;
        if (!quote || !transport || this.state.phase !== 'confirmation') return;
        if (Date.parse(quote.expiresAt) <= Date.now()) {
            this.publish({ phase: 'failed', quote: null });
            return;
        }
        // A retained id fences retries if a network response is lost.
        this.confirmationOperation ??= crypto.randomUUID();
        const revision = this.revision;
        const abort = this.abort!;
        this.publish({ phase: 'loading', quote: null });
        try {
            await this.resolve(
                await transport.confirm(
                    quote.id,
                    this.confirmationOperation,
                    abort.signal,
                ),
                transport,
                abort.signal,
                revision,
            );
        } catch {
            if (revision === this.revision) this.publish({ phase: 'failed' });
        }
    }
    private async resolve(
        result: SpeechResponse,
        transport: SpeechTransport,
        signal: AbortSignal,
        revision: number,
    ) {
        if (revision !== this.revision) return;
        this.publish({
            requestId: result.requestId,
            billingState: result.billingState,
        });
        const deadline = Date.now() + 10 * 60_000;
        while (result.state === 'queued' || result.state === 'processing') {
            if (revision !== this.revision) return;
            if (!result.requestId || Date.now() >= deadline)
                throw new Error('Speech preparation timeout');
            await delay(
                Math.min(5000, Math.max(500, result.retryAfterMs ?? 1000)),
                signal,
            );
            result = await transport.status(result.requestId, signal);
            if (revision !== this.revision) return;
            this.publish({
                requestId: result.requestId,
                billingState: result.billingState,
            });
        }
        if (revision !== this.revision) return;
        if (result.state === 'confirmation_required' && result.quote) {
            this.publish({ phase: 'confirmation', quote: result.quote });
            return;
        }
        if (
            result.state === 'unavailable' ||
            result.state === 'submission_unknown'
        ) {
            this.publish({ phase: 'unavailable', quote: null });
            return;
        }
        if (result.state !== 'ready' || !result.playbackId)
            throw new Error('Pronunciation generation failed');
        const blob = await transport.bytes(result.playbackId, signal);
        if (revision !== this.revision) return;
        this.url = URL.createObjectURL(blob);
        this.audio = new Audio(this.url);
        this.audio.onended = () => {
            if (revision === this.revision) this.reset();
        };
        this.audio.onerror = () => {
            if (revision === this.revision) {
                this.clear();
                this.publish({ phase: 'failed' });
            }
        };
        this.publish({ fixture: result.fixture, quote: null });
        await this.start(revision);
    }
}

export const speechPlayer = new SpeechPlayer();
