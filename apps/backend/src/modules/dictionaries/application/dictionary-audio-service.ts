import { createHmac, randomUUID } from 'node:crypto';
import type {
    DictionaryAudioField,
    DictionaryAudioRequest,
    DictionaryAudioResponse,
} from '@languon/contracts';
import { resolveDictionaryAudio } from '../domain/audio';
import {
    DictionaryCardNotFoundError,
    DictionaryVersionConflictError,
    DictionaryRateLimitError,
    InvalidDictionaryRequestError,
} from './dictionary-errors';
import type { DictionaryAuthentication } from './ports/dictionary-authentication';
import type { DictionaryStore } from './ports/dictionary-store';
import type {
    AudioBudget,
    DictionaryAudioStore,
} from './ports/dictionary-audio-store';
import type { AudioObjectStorage } from './ports/audio-object-storage';
import type { SpeechSynthesisProvider } from './ports/speech-synthesis-provider';
import type { DictionaryRateLimiter } from './ports/dictionary-rate-limiter';

export interface DictionaryAudioDependencies {
    rateLimiter: DictionaryRateLimiter;
    authentication: DictionaryAuthentication;
    dictionaries: DictionaryStore;
    store: DictionaryAudioStore;
    storage: AudioObjectStorage;
    provider: Pick<SpeechSynthesisProvider, 'supports'> | null;
    fingerprintSecret: string | Uint8Array;
    clock: { now(): Date };
    budget: AudioBudget;
    playbackEnabled: boolean;
    generationEnabled: boolean;
}
export class DictionaryAudioService {
    private activeReads = 0;
    constructor(private readonly dependencies: DictionaryAudioDependencies) {}
    private async resolve(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        field: DictionaryAudioField,
        signal: AbortSignal,
        limitScope?: 'audio-request' | 'audio-status' | 'audio-content',
    ) {
        const { userId: ownerId } =
            await this.dependencies.authentication.authenticate(accessToken);
        if (limitScope) {
            const decision = await this.dependencies.rateLimiter.consume({
                key: ownerId,
                scope: limitScope,
                signal,
            });
            if (!decision.allowed)
                throw new DictionaryRateLimitError(
                    decision.retryAfterSeconds ?? 1,
                );
            if (limitScope === 'audio-content') {
                const global = await this.dependencies.rateLimiter.consume({
                    key: 'all',
                    scope: 'audio-content-global',
                    signal,
                });
                if (!global.allowed)
                    throw new DictionaryRateLimitError(
                        global.retryAfterSeconds ?? 1,
                    );
            }
        }
        const context = { now: this.dependencies.clock.now(), signal };
        const dictionary = await this.dependencies.dictionaries.readDictionary({
            ownerId,
            dictionaryId,
            context,
        });
        const { card } = await this.dependencies.dictionaries.readCard({
            ownerId,
            dictionaryId,
            cardId,
            context,
        });
        if (dictionary.lifecycle !== 'active' || card.lifecycle !== 'active')
            throw new DictionaryCardNotFoundError();
        const content = resolveDictionaryAudio(dictionary, card, field);
        const fingerprint = content
            ? createHmac('sha256', this.dependencies.fingerprintSecret)
                  .update(
                      JSON.stringify([
                          ownerId,
                          cardId,
                          field,
                          content.text,
                          content.language,
                      ]),
                  )
                  .digest('hex')
            : '';
        return {
            ownerId,
            dictionaryId,
            cardId,
            field,
            fingerprint,
            content,
            card,
            dictionary,
        };
    }
    async request(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        request: DictionaryAudioRequest,
        context: { signal: AbortSignal },
    ): Promise<DictionaryAudioResponse> {
        const identity = await this.resolve(
            accessToken,
            dictionaryId,
            cardId,
            request.field,
            context.signal,
            'audio-request',
        );
        if (
            identity.card.version !== request.expectedCardVersion ||
            identity.dictionary.settingsVersion !==
                request.expectedSettingsVersion
        )
            throw new DictionaryVersionConflictError();
        if (!this.dependencies.playbackEnabled || !identity.content)
            return this.unavailable(request.field);
        const existing = await this.dependencies.store.find(identity);
        if (existing && !['failed', 'cancelled'].includes(existing.job.state))
            return this.response(request.field, existing.job);
        const profile = this.dependencies.generationEnabled
            ? this.dependencies.provider?.supports(identity.content.language)
            : null;
        if (!profile) return this.unavailable(request.field);
        const result = await this.dependencies.store.enqueue({
            ...identity,
            ...identity.content,
            cardVersion: identity.card.version,
            settingsVersion: identity.dictionary.settingsVersion,
            profile,
            now: this.dependencies.clock.now(),
            budget: this.dependencies.budget,
            storage: {
                ...this.dependencies.storage.identity,
                key: `dictionary-audio/${identity.ownerId}/${randomUUID()}`,
            },
        });
        return this.response(request.field, result.job);
    }
    async status(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        field: DictionaryAudioField,
        context: { signal: AbortSignal },
    ): Promise<DictionaryAudioResponse> {
        const identity = await this.resolve(
            accessToken,
            dictionaryId,
            cardId,
            field,
            context.signal,
            'audio-status',
        );
        if (!this.dependencies.playbackEnabled || !identity.content)
            return this.unavailable(field);
        const existing = await this.dependencies.store.find(identity);
        return existing
            ? this.response(field, existing.job)
            : this.unavailable(field);
    }
    async content(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        field: DictionaryAudioField,
        assetId: string,
        context: { signal: AbortSignal },
    ) {
        const identity = await this.resolve(
            accessToken,
            dictionaryId,
            cardId,
            field,
            context.signal,
            'audio-content',
        );
        const existing =
            identity.content && this.dependencies.playbackEnabled
                ? await this.dependencies.store.find(identity)
                : null;
        if (
            !existing ||
            existing.job.state !== 'ready' ||
            existing.asset.state !== 'ready' ||
            existing.asset.id !== assetId
        )
            throw new DictionaryCardNotFoundError();
        if (this.activeReads >= 4) throw new DictionaryRateLimitError(1);
        this.activeReads += 1;
        let audio;
        try {
            audio = await this.dependencies.storage.read(
                existing.asset.storage,
                context.signal,
            );
        } finally {
            this.activeReads -= 1;
        }
        if (
            !audio ||
            audio.bytes.byteLength > 5 * 1024 * 1024 ||
            audio.checksum !== existing.asset.checksum
        )
            throw new InvalidDictionaryRequestError();
        // Recheck authorization after the potentially remote object read.
        const current = await this.resolve(
            accessToken,
            dictionaryId,
            cardId,
            field,
            context.signal,
        );
        if (current.fingerprint !== identity.fingerprint)
            throw new DictionaryCardNotFoundError();
        return audio;
    }
    private unavailable(field: DictionaryAudioField): DictionaryAudioResponse {
        return {
            state: 'unavailable',
            field,
            assetId: null,
            fixture: false,
            retryAfterMs: null,
            error: null,
        };
    }
    private response(
        field: DictionaryAudioField,
        job: {
            state: string;
            assetId: string;
            profile: { provider: string };
            deadlineAt: Date;
            error: string | null;
        },
    ): DictionaryAudioResponse {
        const timedOut =
            job.deadlineAt <= this.dependencies.clock.now() &&
            !['ready', 'failed', 'submission_unknown'].includes(job.state);
        const state: DictionaryAudioResponse['state'] = timedOut
            ? 'failed'
            : job.state === 'ready'
              ? 'ready'
              : job.state === 'queued'
                ? 'queued'
                : job.state === 'submission_unknown'
                  ? 'submission_unknown'
                  : ['failed', 'cancelled'].includes(job.state)
                    ? 'failed'
                    : 'processing';
        return {
            state,
            field,
            assetId: state === 'ready' ? job.assetId : null,
            fixture: job.profile.provider === 'fixture',
            retryAfterMs: ['queued', 'processing'].includes(state)
                ? 1500
                : null,
            error: timedOut ? 'generation_timeout' : job.error,
        };
    }
}
