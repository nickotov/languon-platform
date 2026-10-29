import { transcriptionCredentialFingerprint } from './transcription-credential-fingerprint';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeTranscriptionJobService } from '../application/transcription-job-service';
import { KnowledgeTranscriptionWorker } from '../application/transcription-worker';
import { DrizzleKnowledgeTranscriptionStore } from './persistence/drizzle/drizzle-transcription-job-store';
import type { KnowledgeDatabase } from './persistence/drizzle/knowledge-transaction';
import { OpenAiKnowledgeTranscriptionProvider } from './transcription-openai';

export function createKnowledgeTranscriptionService(input: {
    database: KnowledgeDatabase;
    apiKey?: string;
    executionReady?: boolean;
    authenticate(token: string): Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
}) {
    return new KnowledgeTranscriptionJobService({
        store: new DrizzleKnowledgeTranscriptionStore({
            database: input.database,
            credentialFingerprint: transcriptionCredentialFingerprint(
                input.apiKey,
            ),
            executionReady: !!input.apiKey && input.executionReady !== false,
        }),
        authenticate: input.authenticate,
        rateLimiter: input.rateLimiter,
    });
}
/** Provider factories receive only a claimed lease and its fenced one-shot dispatch authority. */
export function createKnowledgeTranscriptionWorker(input: {
    database: KnowledgeDatabase;
    apiKey?: string;
    workerId: string;
    fetch?: typeof globalThis.fetch;
}) {
    const store = new DrizzleKnowledgeTranscriptionStore({
        database: input.database,
        credentialFingerprint: transcriptionCredentialFingerprint(input.apiKey),
        executionReady: !!input.apiKey,
    });
    return new KnowledgeTranscriptionWorker({
        store,
        workerId: input.workerId,
        createProvider: (lease) => {
            if (!input.apiKey)
                throw new Error('Transcription credentials are unavailable.');
            return new OpenAiKnowledgeTranscriptionProvider({
                apiKey: input.apiKey,
                authority: {
                    authorizeDispatch: (request) =>
                        store.authorizeDispatch(lease, request),
                },
                timeoutMs: 60_000,
                ...(input.fetch ? { fetch: input.fetch } : {}),
            });
        },
    });
}
