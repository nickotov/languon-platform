import {
    TransientTranscriptionStoreError,
    type KnowledgeTranscriptionJobStore,
} from '../../../application/transcription-job-store';
import { submitTranscription } from './transcription-admission';
import {
    claimTranscription,
    heartbeatTranscription,
    transcriptionAudio,
    authorizeTranscription,
} from './transcription-execution';
import {
    finishTranscription,
    cancelTranscription,
    recoverTranscriptions,
} from './transcription-terminal';
import {
    ownedTranscriptionJob,
    transcriptionJob,
    transcriptionUnavailable,
    type TranscriptionContext,
} from './transcription-context';

// Driver failures may sit under a DrizzleQueryError. Constraint, validation and
// permission errors remain terminal and must never enter settlement backoff.
const retryableWriteCodes = new Set([
    '40001',
    '40P01',
    '55P03',
    '53300',
    '57P01',
    '57P02',
    '57P03',
    '08000',
    '08001',
    '08003',
    '08006',
    '08007',
    'CONNECTION_CLOSED',
    'CONNECTION_ENDED',
    'CONNECTION_DESTROYED',
    'CONNECT_TIMEOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'EHOSTUNREACH',
]);

function rethrowTranscriptionWriteError(error: unknown): never {
    const visited = new Set<Error>();
    let cause = error;
    while (cause instanceof Error && !visited.has(cause)) {
        if (
            'code' in cause &&
            typeof cause.code === 'string' &&
            retryableWriteCodes.has(cause.code)
        ) {
            throw new TransientTranscriptionStoreError();
        }

        visited.add(cause);
        cause = cause.cause;
    }

    throw error;
}

export class DrizzleKnowledgeTranscriptionStore implements KnowledgeTranscriptionJobStore {
    private readonly context: TranscriptionContext;
    constructor(
        private readonly options: {
            database: TranscriptionContext['database'];
            clock?: TranscriptionContext['clock'];
            executionReady: boolean;
            credentialFingerprint?: string | null;
        },
    ) {
        this.context = {
            database: options.database,
            clock: options.clock ?? { now: () => new Date() },
            credentialFingerprint: options.credentialFingerprint ?? null,
        };
    }

    submit(...input: Parameters<KnowledgeTranscriptionJobStore['submit']>) {
        if (!this.options.executionReady) {
            throw transcriptionUnavailable(
                'Transcription credentials and a compatible executor are required.',
            );
        }

        return submitTranscription(this.context, ...input);
    }

    read(
        ...[ownerId, noteId, id]: Parameters<
            KnowledgeTranscriptionJobStore['read']
        >
    ) {
        return this.context.database.transaction(async (tx) =>
            transcriptionJob(
                await ownedTranscriptionJob(tx, ownerId, noteId, id),
            ),
        );
    }

    cancel(...input: Parameters<KnowledgeTranscriptionJobStore['cancel']>) {
        return cancelTranscription(this.context, ...input);
    }

    claim(...input: Parameters<KnowledgeTranscriptionJobStore['claim']>) {
        return this.options.executionReady
            ? claimTranscription(this.context, ...input)
            : Promise.resolve(null);
    }

    heartbeat(
        ...input: Parameters<KnowledgeTranscriptionJobStore['heartbeat']>
    ) {
        return heartbeatTranscription(this.context, ...input).catch(
            rethrowTranscriptionWriteError,
        );
    }

    audio(...input: Parameters<KnowledgeTranscriptionJobStore['audio']>) {
        return transcriptionAudio(this.context, ...input);
    }

    authorizeDispatch(
        ...input: Parameters<
            KnowledgeTranscriptionJobStore['authorizeDispatch']
        >
    ) {
        return authorizeTranscription(this.context, ...input);
    }

    finish(...input: Parameters<KnowledgeTranscriptionJobStore['finish']>) {
        return finishTranscription(this.context, ...input).catch(
            rethrowTranscriptionWriteError,
        );
    }

    recoverExpired() {
        return recoverTranscriptions(this.context);
    }
}
