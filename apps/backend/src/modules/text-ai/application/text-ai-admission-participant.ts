import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from './text-ai-provider-catalog';

export interface TextAiAdmissionExecution {
    budget: TextAiProviderBudgetPolicy;
    revisionId: string | null;
    snapshot: TextAiExecutionSnapshot | null;
    selectionVersion: 1 | null;
}

export interface TextAiAdmissionParticipant {
    resolve(input: {
        userId: string;
        format: string;
        now: Date;
        legacyBudget: TextAiProviderBudgetPolicy;
        requiredWorkerFormat?: string;
    }): Promise<TextAiAdmissionExecution>;
}

export class TextAiSelectionUnavailableError extends Error {
    public constructor() {
        super(
            'AI generation is temporarily unavailable. Please try again later.',
        );
        this.name = 'TextAiSelectionUnavailableError';
    }
}
