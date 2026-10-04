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
    }): Promise<TextAiAdmissionExecution>;
}

export class TextAiSelectionUnavailableError extends Error {
    public constructor() {
        super(
            'The selected text AI model is unavailable. Choose another enabled model or Auto.',
        );
        this.name = 'TextAiSelectionUnavailableError';
    }
}
