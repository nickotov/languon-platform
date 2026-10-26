/** Immutable worker lease identity; infrastructure derives the admitted attempt. */
export interface TextAiProviderLeaseContext {
    jobId: string;
    attempt: number;
    workerId: string;
    fencingToken: string;
}
