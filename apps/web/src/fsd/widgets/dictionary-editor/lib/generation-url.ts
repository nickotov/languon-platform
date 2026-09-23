export const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function syncGenerationUrl(
    target: { cardId: string; jobId?: string | undefined } | null,
) {
    const url = new URL(window.location.href);
    if (target) {
        url.searchParams.set('generationCard', target.cardId);
        if (target.jobId) url.searchParams.set('generationJob', target.jobId);
        else url.searchParams.delete('generationJob');
    } else {
        url.searchParams.delete('generationCard');
        url.searchParams.delete('generationJob');
    }

    window.history.replaceState(window.history.state, '', url);
}

export function syncBatchGenerationUrl(jobId: string | null) {
    const url = new URL(window.location.href);
    if (jobId) url.searchParams.set('batchGenerationJob', jobId);
    else url.searchParams.delete('batchGenerationJob');

    window.history.replaceState(window.history.state, '', url);
}

export function syncDocumentGenerationUrl(jobId: string | null) {
    const url = new URL(window.location.href);
    if (jobId) url.searchParams.set('documentGenerationJob', jobId);
    else url.searchParams.delete('documentGenerationJob');

    window.history.replaceState(window.history.state, '', url);
}
