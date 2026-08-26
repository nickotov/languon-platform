import type { DictionaryGenerationJob } from '@languon/contracts';

export function documentGenerationJobForDictionary(
    job: DictionaryGenerationJob,
    dictionaryId: string,
) {
    return job.kind === 'document-terms' && job.dictionaryId === dictionaryId
        ? job
        : null;
}
