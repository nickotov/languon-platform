import {
    DictionaryLanguageTagSchema,
    SentencePreparationStartRequestSchema,
    SentencePreparationCommandRequestSchema,
    type SentencePreparationStartRequest,
    type SentencePreparationCommandRequest,
} from '@languon/contracts';
import type { Configuration } from '../types';

export type StoredPreparation = {
    explanationLanguage?: NonNullable<Configuration['explanationLanguage']>;
    id?: string;
    start?: SentencePreparationStartRequest;
    command?: SentencePreparationCommandRequest;
};
export function parseStoredPreparation(value: unknown): StoredPreparation {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    const input = value as Record<string, unknown>;
    const id =
        typeof input.id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.id)
            ? input.id
            : undefined;
    const start = SentencePreparationStartRequestSchema.safeParse(input.start);
    const explanation = DictionaryLanguageTagSchema.safeParse(
        input.explanationLanguage,
    );
    const command = SentencePreparationCommandRequestSchema.safeParse(
        input.command,
    );

    return {
        ...(explanation.success
            ? { explanationLanguage: explanation.data }
            : {}),
        ...(id ? { id } : {}),
        ...(start.success ? { start: start.data } : {}),
        ...(id && command.success ? { command: command.data } : {}),
    };
}
