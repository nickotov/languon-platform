import type { DictionaryAudioField } from '@languon/contracts';
import type { AudioObjectReference } from './audio-object-storage';
import type { SpeechProfile } from './speech-synthesis-provider';

export interface AudioJob {
    id: string;
    ownerId: string;
    dictionaryId: string;
    cardId: string;
    field: string;
    fingerprint: string;
    assetId: string;
    text: string;
    profile: SpeechProfile;
    state: string;
    taskId: string | null;
    leaseToken: string | null;
    leaseExpiresAt: Date | null;
    nextPollAt: Date;
    deadlineAt: Date;
    reservedCost: number;
    error: string | null;
    createdAt: Date;
    cardVersion: number;
    settingsVersion: number;
}
export interface AudioAsset {
    id: string;
    ownerId: string;
    dictionaryId: string;
    cardId: string;
    field: string;
    fingerprint: string;
    storage: AudioObjectReference;
    state: string;
    checksum: string | null;
    mimeType: string | null;
    byteLength: number | null;
    createdAt: Date;
    writerExpiresAt: Date | null;
    lastAccessedAt: Date;
}
export interface AudioIdentity {
    ownerId: string;
    dictionaryId: string;
    cardId: string;
    field: DictionaryAudioField;
    fingerprint: string;
}
export interface AudioBudget {
    ownerDailyCost: number;
    globalDailyCost: number;
    ownerQueued: number;
    ownerActive: number;
    globalActive: number;
    maxCharacters?: number;
    maxCostPerClip?: number;
}
export interface DictionaryAudioStore {
    find(
        identity: AudioIdentity,
    ): Promise<{ job: AudioJob; asset: AudioAsset } | null>;
    enqueue(
        input: AudioIdentity & {
            text: string;
            profile: SpeechProfile;
            storage: AudioObjectReference;
            now: Date;
            budget: AudioBudget;
            cardVersion: number;
            settingsVersion: number;
        },
    ): Promise<{ job: AudioJob; asset: AudioAsset }>;
    claim(
        now: Date,
        budget: AudioBudget,
        generationEnabled?: boolean,
    ): Promise<AudioJob | null>;
    transition(
        job: AudioJob,
        patch: Partial<
            Pick<AudioJob, 'state' | 'taskId' | 'nextPollAt' | 'error'>
        >,
        now: Date,
    ): Promise<boolean>;
    beginWrite(job: AudioJob, now: Date): Promise<AudioAsset | null>;
    complete(
        job: AudioJob,
        input: {
            checksum: string;
            mimeType: string;
            byteLength: number;
            storage: AudioObjectReference;
        },
        now: Date,
    ): Promise<boolean>;
    cleanupCandidate(
        now: Date,
        reconcile?: boolean,
    ): Promise<AudioAsset | null>;
    finishCleanup(assetId: string): Promise<void>;
}
