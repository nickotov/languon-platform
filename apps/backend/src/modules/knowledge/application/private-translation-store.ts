import type {
    EnqueueTextTranslationRequest,
    KnowledgePrivateTranslation,
    TextAiJob,
    TextSourceSegment,
} from '@languon/contracts';
import type { LearnerSourceAccess } from './learner-store';
import type { KnowledgeLearningSourceBinding } from './learning-source-binding';
export interface KnowledgeTranslationJobs {
    enqueueKnowledgeTranslation(
        actorId: string,
        input: EnqueueTextTranslationRequest,
        segments: TextSourceSegment[],
        source: KnowledgeLearningSourceBinding,
        context: { now: Date; signal: AbortSignal },
    ): Promise<TextAiJob>;
    get(
        actorId: string,
        jobId: string,
        context: { now: Date; signal: AbortSignal },
    ): Promise<TextAiJob>;
    cancel(
        actorId: string,
        jobId: string,
        context: { now: Date; signal: AbortSignal },
    ): Promise<TextAiJob>;
}
export interface PrivateTranslationActor {
    actorId: string;
    noteId: string;
    blockId: string;
    access?: LearnerSourceAccess;
}
export interface KnowledgePrivateTranslationStore {
    list(
        source: PrivateTranslationActor,
    ): Promise<{ translations: KnowledgePrivateTranslation[] }>;
    request(
        source: PrivateTranslationActor,
        input: {
            operationId: string;
            targetLanguage: KnowledgePrivateTranslation['targetLanguage'];
        },
        signal: AbortSignal,
        beforeAdmission?: () => Promise<void>,
    ): Promise<{ job: TextAiJob }>;
    job(
        source: PrivateTranslationActor,
        jobId: string,
        signal: AbortSignal,
    ): Promise<{ job: TextAiJob }>;
    cancel(
        source: PrivateTranslationActor,
        jobId: string,
        signal: AbortSignal,
    ): Promise<{ job: TextAiJob }>;
}
