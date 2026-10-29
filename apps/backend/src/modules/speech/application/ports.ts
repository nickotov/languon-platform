import type {
    SpeechResponse,
    SpeechSource,
    AdminSpeechRecording,
} from '@languon/contracts';
import type {
    AudioBytes,
    AudioObjectReference,
    AudioObjectStorage,
} from './ports/audio-object-storage';
import type {
    SpeechProfile,
    SpeechSynthesisProvider,
    SpeechProviderObservation,
} from './ports/speech-synthesis-provider';

export type {
    AudioBytes,
    AudioObjectReference,
    AudioObjectStorage,
    SpeechProfile,
    SpeechSynthesisProvider,
    SpeechProviderObservation,
};
export type KnowledgeSnippetSpeechSource = Extract<
    SpeechSource,
    { kind: 'knowledge-snippet' }
>;
export type StoredKnowledgeSnippetSpeechSource = Omit<
    KnowledgeSnippetSpeechSource,
    'origin'
> & {
    origin:
        | Exclude<KnowledgeSnippetSpeechSource['origin'], { kind: 'saved' }>
        | {
              kind: 'saved';
              expectedNoteVersion: number;
              access?: {
                  kind: 'note' | 'workbook';
                  locator: string;
                  keyDigest: string;
              };
          };
};
export type StoredSpeechSource =
    | StoredKnowledgeSnippetSpeechSource
    | Extract<
          SpeechSource,
          { kind: 'knowledge-block' | 'knowledge-audio-draft' }
      >
    | {
          [
              Kind in Exclude<
                  SpeechSource['kind'],
                  | 'knowledge-block'
                  | 'knowledge-snippet'
                  | 'knowledge-audio-draft'
              >
          ]: Omit<Extract<SpeechSource, { kind: Kind }>, 'access'> & {
              access:
                  | { kind: 'owner'; dictionaryId: string }
                  | { kind: 'shared'; shareId: string; keyDigest: string };
          };
      }[Exclude<
          SpeechSource['kind'],
          'knowledge-block' | 'knowledge-snippet' | 'knowledge-audio-draft'
      >];
export interface ResolvedSpeechSource {
    privateKnowledgeSource?: { noteId: string; ownerId: string };
    text: string;
    language: string;
    revision: string;
    authority?: StoredSpeechSource;
    dictionaryId?: string;
    cardId?: string;
    exerciseId?: string;
    attemptId?: string;
}
export interface SpeechSourceResolver {
    resolve(
        actorId: string,
        source: SpeechSource | StoredSpeechSource,
    ): Promise<ResolvedSpeechSource>;
}
export interface SpeechProfileResolver {
    supports(language: string): SpeechProfile | null;
}
export interface SpeechJob {
    id: string;
    recordingId: string;
    text: string;
    language: string;
    profile: SpeechProfile;
    state: string;
    taskId: string | null;
    leaseToken: string;
    deadlineAt: Date;
    storage: AudioObjectReference;
    checksum: string | null;
}
export interface SpeechStore {
    availability(
        actorId: string,
        source: SpeechSource,
        resolved: ResolvedSpeechSource,
    ): Promise<{ playable: boolean; generationAvailable: boolean }>;
    prepare(input: {
        actorId: string;
        source: SpeechSource;
        resolved: ResolvedSpeechSource;
        operationId: string;
        now: Date;
    }): Promise<SpeechResponse>;
    confirm(input: {
        actorId: string;
        quoteId: string;
        operationId: string;
        now: Date;
    }): Promise<SpeechResponse>;
    request(
        actorId: string,
        requestId: string,
        now: Date,
    ): Promise<{
        source: StoredSpeechSource;
        revision: string;
        response: SpeechResponse;
    }>;
    playback(
        actorId: string,
        playbackId: string,
        now: Date,
    ): Promise<{
        source: StoredSpeechSource;
        revision: string;
        storage: AudioObjectReference;
        checksum: string;
        fixture: boolean;
    }>;
    claim(now: Date): Promise<SpeechJob | null>;
    authorizeDispatch?(job: SpeechJob, now: Date): Promise<boolean>;
    submitted(
        job: SpeechJob,
        taskId: string,
        retryAfterMs: number,
        now: Date,
    ): Promise<void>;
    pending(
        job: SpeechJob,
        retryAfterMs: number,
        now: Date,
        observation?: SpeechProviderObservation,
    ): Promise<void>;
    storing(
        job: SpeechJob,
        audio: AudioBytes,
        now: Date,
        observation?: SpeechProviderObservation,
    ): Promise<boolean>;
    complete(
        job: SpeechJob,
        storage: AudioObjectReference,
        audio: AudioBytes,
        now: Date,
    ): Promise<void>;
    fail(
        job: SpeechJob,
        outcome: 'failure' | 'unknown',
        now: Date,
        reason?: 'speech_provider_unavailable',
        notSubmitted?: boolean,
        observation?: SpeechProviderObservation,
    ): Promise<void>;
    releaseDeadlines(now: Date): Promise<void>;
    listRecordings(query: {
        search?: string;
        language?: string;
        provider?: string;
        model?: string;
        linked?: 'true' | 'false';
        state?: string;
        createdFrom?: string;
        createdTo?: string;
        page: number;
        pageSize: number;
    }): Promise<{ recordings: AdminSpeechRecording[]; total: number }>;
    adminPlayback(recordingId: string): Promise<AudioObjectReference>;
    markDeleting(input: {
        audit: {
            actorId: string;
            correlationId: string;
            reason: string;
            occurredAt: Date;
        };
        recordings: {
            id: string;
            expectedVersion: number;
            expectedBindingCount: number;
        }[];
    }): Promise<{ id: string; storage: AudioObjectReference }[]>;
    deleted(recordingId: string, now?: Date): Promise<void>;
    deletionInventory(
        now: Date,
    ): Promise<{ id: string; storage: AudioObjectReference }[]>;
    purgeActor(actorId: string, now: Date): Promise<void>;
}
