import type { KnowledgeTranscriptionJob } from '@languon/contracts';
export const transcriptionTerminal = (job: KnowledgeTranscriptionJob | null) =>
    job !== null && ['completed', 'failed', 'cancelled'].includes(job.state);
function delay(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const stop = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', stop);
            resolve();
        }, 2500);
        signal.addEventListener('abort', stop, { once: true });
    });
}
export async function pollTranscription(
    job: KnowledgeTranscriptionJob,
    read: () => Promise<KnowledgeTranscriptionJob>,
    signal: AbortSignal,
    onJob: (job: KnowledgeTranscriptionJob) => void,
) {
    const deadline = Date.now() + 600_000;
    onJob(job);
    while (job.state === 'queued' || job.state === 'running') {
        if (Date.now() > deadline)
            throw new Error('Transcription observation timed out.');
        await delay(signal);
        job = await read();
        signal.throwIfAborted();
        onJob(job);
    }
    return job;
}
