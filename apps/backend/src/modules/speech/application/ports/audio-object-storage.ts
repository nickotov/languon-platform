export interface AudioObjectReference {
    backend: 'postgres' | 's3';
    namespace: string;
    key: string;
    versionId?: string;
}

export type { AudioBytes } from '../../domain/audio-bytes';
import type { AudioBytes } from '../../domain/audio-bytes';

export interface AudioObjectStorage {
    readonly identity: { backend: 'postgres' | 's3'; namespace: string };
    put(
        key: string,
        audio: AudioBytes,
        signal?: AbortSignal,
    ): Promise<AudioObjectReference>;
    /** Write to the immutable inventory namespace, even after defaults change. */
    putForReference(
        reference: AudioObjectReference,
        audio: AudioBytes,
        signal?: AbortSignal,
    ): Promise<AudioObjectReference>;
    read(
        reference: AudioObjectReference,
        signal?: AbortSignal,
    ): Promise<AudioBytes | null>;
    /** Remove every physical version and verify absence before resolving. */
    delete(reference: AudioObjectReference): Promise<void>;
}
