import type { SpeechSource, SpeechResponse } from '@languon/contracts';
import type {
    AudioObjectStorage,
    SpeechStore,
    SpeechSourceResolver,
} from './ports';
import { SpeechError } from '../domain/speech-policy';
import { assertAudioIntegrity } from '../domain/audio-integrity';

export class SpeechService {
    private readonly now: () => Date;
    public constructor(
        private readonly options: {
            store: SpeechStore;
            resolver: SpeechSourceResolver;
            storage: AudioObjectStorage;
            now?: () => Date;
        },
    ) {
        this.now = options.now ?? (() => new Date());
    }
    public async availability(actorId: string, sources: SpeechSource[]) {
        const availability = await Promise.all(
            sources.map(async (source) => {
                try {
                    const resolved = await this.options.resolver.resolve(
                        actorId,
                        source,
                    );
                    return {
                        source,
                        ...(await this.options.store.availability(
                            actorId,
                            source,
                            resolved,
                        )),
                    };
                } catch {
                    return {
                        source,
                        playable: false,
                        generationAvailable: false,
                    };
                }
            }),
        );
        return { availability };
    }
    public async prepare(
        actorId: string,
        input: { source: SpeechSource; operationId: string },
    ): Promise<SpeechResponse> {
        const resolved = await this.options.resolver.resolve(
            actorId,
            input.source,
        );
        return this.options.store.prepare({
            ...input,
            actorId,
            resolved,
            now: this.now(),
        });
    }
    public confirm(
        actorId: string,
        input: { quoteId: string; operationId: string },
    ) {
        return this.options.store.confirm({
            ...input,
            actorId,
            now: this.now(),
        });
    }
    public async status(actorId: string, requestId: string) {
        const result = await this.options.store.request(
            actorId,
            requestId,
            this.now(),
        );
        const resolved = await this.options.resolver.resolve(
            actorId,
            result.source,
        );
        if (resolved.revision !== result.revision)
            throw new SpeechError('speech_source_changed');
        return result.response;
    }
    public async content(
        actorId: string,
        playbackId: string,
        signal?: AbortSignal,
    ) {
        const handle = await this.options.store.playback(
            actorId,
            playbackId,
            this.now(),
        );
        const resolved = await this.options.resolver.resolve(
            actorId,
            handle.source,
        );
        if (resolved.revision !== handle.revision)
            throw new SpeechError('speech_source_changed');
        const audio = await this.options.storage.read(handle.storage, signal);
        if (!audio || audio.checksum !== handle.checksum)
            throw new SpeechError('speech_recording_unavailable', 404);
        assertAudioIntegrity(audio);
        // Fresh authorization and inventory state immediately before private delivery.
        const latest = await this.options.resolver.resolve(
            actorId,
            handle.source,
        );
        if (latest.revision !== handle.revision)
            throw new SpeechError('speech_source_changed');
        await this.options.store.playback(actorId, playbackId, this.now());
        return { audio, fixture: handle.fixture };
    }
}
