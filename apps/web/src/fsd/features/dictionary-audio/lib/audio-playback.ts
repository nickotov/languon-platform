import type { AudioPlaybackState, AudioSelection } from '../types';

export type AudioPlaybackTransport = {
    prepare(
        selection: AudioSelection,
        signal: AbortSignal,
    ): Promise<{ blob: Blob; fixture: boolean }>;
};

/** One controller owns one clip. Every asynchronous continuation is fenced. */
export class AudioPlayback {
    private revision = 0;
    private abort: AbortController | null = null;
    private audio: HTMLAudioElement | null = null;
    private url: string | null = null;
    private speed = 1;
    private state: AudioPlaybackState = {
        selection: null,
        phase: 'idle',
        fixture: false,
    };

    constructor(
        private readonly transport: AudioPlaybackTransport,
        private readonly changed: (state: AudioPlaybackState) => void,
    ) {}

    private publish(patch: Partial<AudioPlaybackState>) {
        this.state = { ...this.state, ...patch };
        this.changed(this.state);
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
            this.audio = null;
        }
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = null;
    }

    dispose() {
        this.clear();
    }

    stop() {
        this.clear();
        this.publish({ phase: 'stopped' });
    }

    reset() {
        this.clear();
        this.publish({ selection: null, phase: 'idle', fixture: false });
    }

    setSpeed(speed: number) {
        this.speed = speed === 0.8 ? 0.8 : 1;
        if (this.audio) this.audio.playbackRate = this.speed;
    }

    private async start(audio: HTMLAudioElement, revision: number) {
        try {
            await audio.play();
            if (revision === this.revision) this.publish({ phase: 'playing' });
        } catch (error) {
            if (revision !== this.revision) return;
            this.publish({
                phase:
                    error instanceof DOMException &&
                    error.name === 'NotAllowedError'
                        ? 'ready'
                        : 'failed',
            });
        }
    }

    async play(selection: AudioSelection) {
        // Retry blocked autoplay in the fresh click gesture, without a network wait.
        if (
            this.state.phase === 'ready' &&
            this.audio &&
            this.state.selection?.card.id === selection.card.id &&
            this.state.selection.field === selection.field
        ) {
            await this.start(this.audio, this.revision);
            return;
        }
        this.clear();
        const revision = this.revision;
        const abort = new AbortController();
        this.abort = abort;
        this.publish({ selection, phase: 'loading', fixture: false });
        try {
            const result = await this.transport.prepare(
                selection,
                abort.signal,
            );
            if (revision !== this.revision) return;
            this.url = URL.createObjectURL(result.blob);
            const audio = new Audio(this.url);
            this.audio = audio;
            audio.playbackRate = this.speed;
            audio.preservesPitch = true;
            audio.onended = () => {
                if (revision === this.revision) {
                    this.clear();
                    this.publish({ phase: 'stopped' });
                }
            };
            audio.onerror = () => {
                if (revision === this.revision) {
                    this.clear();
                    this.publish({ phase: 'failed' });
                }
            };
            this.publish({ fixture: result.fixture });
            await this.start(audio, revision);
        } catch (error) {
            if (revision !== this.revision) return;
            this.clear();
            this.publish({
                phase:
                    error instanceof AudioUnavailableError
                        ? 'unavailable'
                        : 'failed',
            });
        }
    }
}

export class AudioUnavailableError extends Error {}
