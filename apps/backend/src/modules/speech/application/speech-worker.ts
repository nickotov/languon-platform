import type {
    AudioObjectStorage,
    SpeechStore,
    SpeechSynthesisProvider,
    SpeechProviderObservation,
} from './ports';
import {
    SpeechSubmissionError,
    SpeechTaskFailedError,
    SpeechOutputUnavailableError,
} from './ports/speech-synthesis-provider';
import { assertAudioIntegrity } from '../domain/audio-integrity';

export class SpeechWorker {
    private readonly now: () => Date;
    public constructor(
        private readonly options: {
            store: SpeechStore;
            providers: ReadonlyMap<string, SpeechSynthesisProvider>;
            storage: AudioObjectStorage;
            now?: () => Date;
        },
    ) {
        this.now = options.now ?? (() => new Date());
    }
    public async runOnce(signal?: AbortSignal): Promise<boolean> {
        for (const item of await this.options.store.deletionInventory(
            this.now(),
        )) {
            try {
                await this.options.storage.delete(item.storage);
                await this.options.store.deleted(item.id, this.now());
            } catch {
                /* Durable deletion inventory remains unavailable and retries next tick. */
            }
        }
        await this.options.store.releaseDeadlines(this.now());
        const job = await this.options.store.claim(this.now());
        if (!job) return false;
        const provider = this.options.providers.get(
            job.profile.configurationId,
        );
        let submissionResolved = job.state !== 'submitting';
        let observation: SpeechProviderObservation | undefined;
        try {
            if (job.state === 'storing') {
                const stored = await this.options.storage.read(
                    job.storage,
                    signal,
                );
                if (stored && stored.checksum === job.checksum) {
                    assertAudioIntegrity(stored);
                    await this.options.store.complete(
                        job,
                        job.storage,
                        stored,
                        this.now(),
                    );
                    return true;
                }
            }
            // Missing a known output never causes resubmission. Immediate-provider
            // storage failures preserve inventory and require operator reconciliation.
            if (job.state === 'storing' && !job.taskId) {
                await this.options.store.fail(job, 'unknown', this.now());
                return true;
            }
            if (!provider) {
                if (job.state === 'submitting')
                    await this.options.store.fail(
                        job,
                        'failure',
                        this.now(),
                        undefined,
                        true,
                    );
                else await this.options.store.pending(job, 30_000, this.now());
                return true;
            }
            if (
                !job.taskId &&
                this.options.store.authorizeDispatch &&
                !(await this.options.store.authorizeDispatch(job, this.now()))
            )
                return true;
            const result = job.taskId
                ? await provider.poll({
                      taskId: job.taskId,
                      profile: job.profile,
                      ...(signal ? { signal } : {}),
                  })
                : await provider.submit({
                      text: job.text,
                      profile: job.profile,
                      requestId: job.id,
                      ...(signal ? { signal } : {}),
                  });
            submissionResolved = true;
            if (result.state === 'pending') {
                if (job.taskId)
                    await this.options.store.pending(
                        job,
                        result.retryAfterMs,
                        this.now(),
                    );
                else
                    await this.options.store.submitted(
                        job,
                        result.taskId,
                        result.retryAfterMs,
                        this.now(),
                    );
                return true;
            }
            observation =
                result.usage || result.execution
                    ? {
                          ...(result.usage ? { usage: result.usage } : {}),
                          ...(result.execution
                              ? { execution: result.execution }
                              : {}),
                      }
                    : undefined;
            assertAudioIntegrity(result.audio);
            if (
                !(await this.options.store.storing(
                    job,
                    result.audio,
                    this.now(),
                    {
                        ...(result.usage ? { usage: result.usage } : {}),
                        ...(result.execution
                            ? { execution: result.execution }
                            : {}),
                    },
                ))
            )
                return true;
            const reference = await this.options.storage.putForReference(
                job.storage,
                result.audio,
                signal,
            );
            await this.options.store.complete(
                job,
                reference,
                result.audio,
                this.now(),
            );
        } catch (error) {
            if (
                error instanceof SpeechTaskFailedError ||
                (error instanceof SpeechSubmissionError &&
                    error.outcome === 'not_submitted')
            ) {
                if (error instanceof SpeechTaskFailedError) {
                    const reason =
                        error.reason === 'provider_unavailable'
                            ? ('speech_provider_unavailable' as const)
                            : undefined;
                    if (error.observation)
                        await this.options.store.fail(
                            job,
                            'failure',
                            this.now(),
                            reason,
                            false,
                            error.observation,
                        );
                    else if (reason)
                        await this.options.store.fail(
                            job,
                            'failure',
                            this.now(),
                            reason,
                        );
                    else
                        await this.options.store.fail(
                            job,
                            'failure',
                            this.now(),
                        );
                } else {
                    await this.options.store.fail(
                        job,
                        'failure',
                        this.now(),
                        undefined,
                        true,
                    );
                }
            } else if (!submissionResolved)
                await this.options.store.fail(job, 'unknown', this.now());
            else {
                const observed =
                    error instanceof SpeechOutputUnavailableError
                        ? error.observation
                        : observation;
                if (observed)
                    await this.options.store.pending(
                        job,
                        5000,
                        this.now(),
                        observed,
                    );
                else await this.options.store.pending(job, 5000, this.now());
            }
        }
        return true;
    }
}
