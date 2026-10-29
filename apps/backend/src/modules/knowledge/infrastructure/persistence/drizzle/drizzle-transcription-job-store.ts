import type { KnowledgeTranscriptionJobStore } from '../../../application/transcription-job-store';
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
        if (!this.options.executionReady)
            throw transcriptionUnavailable(
                'Transcription credentials and a compatible executor are required.',
            );

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
        return heartbeatTranscription(this.context, ...input);
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
        return finishTranscription(this.context, ...input);
    }

    recoverExpired() {
        return recoverTranscriptions(this.context);
    }
}
