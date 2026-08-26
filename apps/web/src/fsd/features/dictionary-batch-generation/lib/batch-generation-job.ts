import type { DictionaryGenerationJob } from '@languon/contracts';

export function batchGenerationJobForDictionary(
    job: DictionaryGenerationJob,
    dictionaryId: string,
) {
    return (job.kind === 'pasted-terms' || job.kind === 'import-pairs') &&
        job.dictionaryId === dictionaryId
        ? job
        : null;
}
