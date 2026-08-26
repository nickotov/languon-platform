import type {
    DictionaryCardResponse,
    DictionarySingleCardGenerationJob,
} from '@languon/contracts';

export function isGenerationJobStale(
    job: DictionarySingleCardGenerationJob | null | undefined,
    current: DictionaryCardResponse | null | undefined,
): boolean {
    if (job?.state !== 'review' || !current) return false;
    return (
        job.expectedDictionaryVersion !== current.dictionaryVersion ||
        job.expectedSettingsVersion !== current.card.settingsVersion ||
        job.expectedCardVersion !== current.card.version
    );
}
