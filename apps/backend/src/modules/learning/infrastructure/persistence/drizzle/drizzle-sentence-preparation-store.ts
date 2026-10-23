import {
    type SentencePreparationCommandRequest,
    type SentencePreparationStartRequest,
} from '@languon/contracts';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import type { SentencePreparationStore } from '../../../application/ports/sentence-preparation-store';
import {
    type SentenceDatabase,
    type SentenceTransaction,
} from './sentence-persistence-support';
import {
    sentencePreparationCommand,
    sentencePreparationGet,
} from './sentence-preparation-command';
import { sentencePreparationTick } from './sentence-preparation-coordinator';
import { sentencePreparationStart } from './sentence-preparation-start';
import type { SentencePreparationPersistencePolicy } from './sentence-preparation-state';
import { type SentencePreparationPersistenceContext } from './sentence-preparation-state';
import {
    sentencePreparationBatch,
    sentencePreparationListBatches,
    sentencePreparationResolvePreparedBatch,
} from './sentence-prepared-batches';

export {
    type SentencePreparationAdmissionRequest,
    type SentencePreparationPersistencePolicy,
} from './sentence-preparation-state';

export class DrizzleSentencePreparationStore implements SentencePreparationStore {
    private readonly persistence: SentencePreparationPersistenceContext;

    constructor(
        database: SentenceDatabase,
        policy: SentencePreparationPersistencePolicy,
    ) {
        this.persistence = { database, policy };
    }

    async start(
        access: LearningAccess,
        input: SentencePreparationStartRequest,
        context: SentenceContext,
    ) {
        return sentencePreparationStart(
            this.persistence,
            access,
            input,
            context,
        );
    }

    async get(access: LearningAccess, id: string, context: SentenceContext) {
        return sentencePreparationGet(this.persistence, access, id, context);
    }

    async command(
        access: LearningAccess,
        id: string,
        input: SentencePreparationCommandRequest,
        context: SentenceContext,
    ) {
        return sentencePreparationCommand(
            this.persistence,
            access,
            id,
            input,
            context,
        );
    }

    async resolvePreparedBatch(
        tx: SentenceTransaction,
        access: LearningAccess,
        id: string,
        context: SentenceContext,
    ) {
        return sentencePreparationResolvePreparedBatch(
            this.persistence,
            tx,
            access,
            id,
            context,
        );
    }

    async batch(access: LearningAccess, id: string, context: SentenceContext) {
        return sentencePreparationBatch(this.persistence, access, id, context);
    }

    async listBatches(
        access: LearningAccess,
        id: string,
        query: { offset: number; limit: number },
        context: SentenceContext,
    ) {
        return sentencePreparationListBatches(
            this.persistence,
            access,
            id,
            query,
            context,
        );
    }

    async tick(context: SentenceContext): Promise<boolean> {
        return sentencePreparationTick(this.persistence, context);
    }
}
