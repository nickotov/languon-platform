import type {
    SentencePreparation,
    SentencePreparationBatch,
    SentencePreparationStartRequest,
    SentencePreparationCommandRequest,
} from '@languon/contracts';
import type { LearningAccess } from './learning-store';
import type { SentenceContext } from './sentence-practice-store';
export interface SentencePreparationStore {
    start(
        access: LearningAccess,
        input: SentencePreparationStartRequest,
        context: SentenceContext,
    ): Promise<SentencePreparation>;
    get(
        access: LearningAccess,
        id: string,
        context: SentenceContext,
    ): Promise<SentencePreparation>;
    command(
        access: LearningAccess,
        id: string,
        input: SentencePreparationCommandRequest,
        context: SentenceContext,
    ): Promise<SentencePreparation>;
    batch(
        access: LearningAccess,
        id: string,
        context: SentenceContext,
    ): Promise<SentencePreparationBatch>;
    listBatches(
        access: LearningAccess,
        id: string,
        query: { offset: number; limit: number },
        context: SentenceContext,
    ): Promise<{
        items: SentencePreparationBatch[];
        nextOffset: number | null;
    }>;
    tick(context: SentenceContext): Promise<boolean>;
}
