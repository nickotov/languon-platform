import { DictionaryAudioFieldSchema } from '@languon/contracts';
import type {
    AudioBudget,
    DictionaryAudioStore,
} from './ports/dictionary-audio-store';
import type { AudioObjectStorage } from './ports/audio-object-storage';
import {
    SpeechSubmissionError,
    SpeechTaskFailedError,
    type SpeechSynthesisProvider,
} from './ports/speech-synthesis-provider';

export class DictionaryAudioWorker {
    private nextReconciliationAt = Number.NEGATIVE_INFINITY;
    constructor(
        private readonly dependencies: {
            store: DictionaryAudioStore;
            providers: ReadonlyMap<string, SpeechSynthesisProvider>;
            storage: AudioObjectStorage;
            clock: { now(): Date };
            budget: AudioBudget;
            generationEnabled?: boolean;
        },
    ) {}
    async runOnce(signal: AbortSignal): Promise<boolean> {
        if (signal.aborted) return false;
        const now = this.dependencies.clock.now();
        const reconcile = now.getTime() >= this.nextReconciliationAt;
        // Reserve before yielding: parallel worker slots must not all sweep.
        // A failed sweep retries at the next cadence, avoiding a hot retry loop.
        if (reconcile) this.nextReconciliationAt = now.getTime() + 60000;
        const cleanup = await this.dependencies.store.cleanupCandidate(
            now,
            reconcile,
        );
        if (cleanup) {
            await this.dependencies.storage.delete(cleanup.storage);
            await this.dependencies.store.finishCleanup(cleanup.id);
            return true;
        }
        const job = await this.dependencies.store.claim(
            this.dependencies.clock.now(),
            this.dependencies.budget,
            this.dependencies.generationEnabled ?? true,
        );
        if (!job) return false;
        const provider = this.dependencies.providers.get(
            job.profile.configurationId,
        );
        let storageIntentActive = job.state === 'storing';
        try {
            if (job.state === 'storing') {
                // Recover bytes without provider calls or extending a stale writer's
                // deadline. Repeated failed reads must not postpone orphan cleanup.
                const existing = await this.dependencies.store.find({
                    ownerId: job.ownerId,
                    dictionaryId: job.dictionaryId,
                    cardId: job.cardId,
                    field: DictionaryAudioFieldSchema.parse(job.field),
                    fingerprint: job.fingerprint,
                });
                const asset =
                    existing?.job.id === job.id ? existing.asset : null;
                const audio = asset
                    ? await this.dependencies.storage.read(
                          asset.storage,
                          AbortSignal.any([signal, AbortSignal.timeout(30000)]),
                      )
                    : null;
                if (asset && audio)
                    await this.dependencies.store.complete(
                        job,
                        {
                            storage: asset.storage,
                            checksum: audio.checksum,
                            mimeType: audio.mimeType,
                            byteLength: audio.bytes.byteLength,
                        },
                        this.dependencies.clock.now(),
                    );
                else
                    await this.dependencies.store.transition(
                        job,
                        {
                            state: job.taskId ? 'waiting_provider' : 'failed',
                            error: 'audio_output_missing',
                            nextPollAt: new Date(
                                this.dependencies.clock.now().getTime() + 10000,
                            ),
                        },
                        this.dependencies.clock.now(),
                    );
                return true;
            }
            if (!provider) {
                await this.dependencies.store.transition(
                    job,
                    {
                        state: job.taskId
                            ? 'waiting_provider'
                            : 'submission_unknown',
                        error: 'provider_configuration_unavailable',
                        nextPollAt: new Date(
                            this.dependencies.clock.now().getTime() + 60000,
                        ),
                    },
                    this.dependencies.clock.now(),
                );
                return true;
            }
            const boundedSignal = AbortSignal.any([
                signal,
                AbortSignal.timeout(30000),
            ]);
            const result = job.taskId
                ? await provider.poll({
                      taskId: job.taskId,
                      profile: job.profile,
                      signal: boundedSignal,
                  })
                : await provider.submit({
                      text: job.text,
                      profile: job.profile,
                      requestId: job.id,
                      signal: boundedSignal,
                  });
            if (result.state === 'pending') {
                await this.dependencies.store.transition(
                    job,
                    {
                        state: 'waiting_provider',
                        taskId: result.taskId,
                        nextPollAt: new Date(
                            this.dependencies.clock.now().getTime() +
                                Math.max(
                                    1000,
                                    Math.min(result.retryAfterMs, 60000),
                                ),
                        ),
                    },
                    this.dependencies.clock.now(),
                );
                return true;
            }
            if (result.audio.bytes.byteLength > 5 * 1024 * 1024)
                throw new Error('Audio exceeds maximum size.');
            // Even a lost beginWrite acknowledgement may have committed storing.
            storageIntentActive = true;
            const asset = await this.dependencies.store.beginWrite(
                job,
                this.dependencies.clock.now(),
            );
            if (!asset) return true;
            const reference = await this.dependencies.storage.putForReference(
                asset.storage,
                result.audio,
                AbortSignal.any([signal, AbortSignal.timeout(30000)]),
            );
            await this.dependencies.store.complete(
                job,
                {
                    storage: reference,
                    checksum: result.audio.checksum,
                    mimeType: result.audio.mimeType,
                    byteLength: result.audio.bytes.byteLength,
                },
                this.dependencies.clock.now(),
            );
        } catch (error) {
            // Once writing begins, leave durable state untouched. A lost upload or
            // publication acknowledgement is recovered as storing after the lease
            // expires, or reclaimed after its writer horizon; never resynthesize.
            if (storageIntentActive) return true;
            // Known upstream tasks retain identity; neither timeout nor storage failure resubmits.
            const state =
                error instanceof SpeechTaskFailedError
                    ? 'failed'
                    : job.taskId
                      ? 'waiting_provider'
                      : error instanceof SpeechSubmissionError &&
                          error.outcome === 'not_submitted'
                        ? 'failed'
                        : 'submission_unknown';
            await this.dependencies.store.transition(
                job,
                {
                    state,
                    error:
                        state === 'submission_unknown'
                            ? 'submission_unknown'
                            : 'provider_unavailable',
                    nextPollAt: new Date(
                        this.dependencies.clock.now().getTime() + 10000,
                    ),
                },
                this.dependencies.clock.now(),
            );
        }
        return true;
    }
}
