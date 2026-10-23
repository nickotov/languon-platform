import type {
    FlashcardAttemptRequest,
    FlashcardConfiguration,
} from '@languon/contracts';
import type { LanguageTag } from '@languon/languages';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { z } from 'zod';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    learningCardSettings,
    type LearningDictionary,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/dictionary-learning-participant';
import type { dictionaryCardsTable as cards } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import type { LearningAccess } from '../../../application/ports/learning-store';
import { LearningAuthenticationRequiredError } from '../../../domain/errors';
import { projectFlashcard } from '../../../domain/flashcard-projection';
import type { flashcardAttemptsTable as attempts } from './schema';

export type Database = PostgresJsDatabase<typeof databaseSchema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type Attempt = typeof attempts.$inferSelect;

export const cursorSchema = z
    .object({
        sort: z
            .string()
            .regex(/^\d{1,19}$/)
            .refine((value) => BigInt(value) <= 9223372036854775807n),
        id: z.uuid(),
        dictionaryId: z.uuid(),
        dictionaryVersion: z.number().int().positive(),
        search: z.string().nullable(),
    })
    .strict();

export function learner(access: LearningAccess): string {
    if (!access.learnerId) throw new LearningAuthenticationRequiredError();

    return access.learnerId;
}

export function present(
    card: typeof cards.$inferSelect,
    owned: LearningDictionary,
    configuration: FlashcardConfiguration,
) {
    return projectFlashcard({
        entryId: card.id,
        learningVersion: card.learningVersion,
        sourceLanguage: owned.dictionary.sourceLanguageTag as LanguageTag,
        targetLanguage: owned.dictionary.targetLanguageTag as LanguageTag,
        values: card,
        settings: learningCardSettings(owned.settings, card),
        configuration,
    });
}

export function attemptResult(row: Attempt) {
    return {
        attemptId: row.id,
        entryId: row.entryId,
        learningVersion: row.learningVersion,
        rating: row.rating,
    };
}

export function undoResult(row: Attempt) {
    return {
        attemptId: row.id,
        entryId: row.entryId,
        learningVersion: row.learningVersion,
        rating: row.undoRating,
    };
}

export function sameAttempt(row: Attempt, input: FlashcardAttemptRequest) {
    return (
        row.entryId === input.entryId &&
        row.sessionId === input.sessionId &&
        row.round === input.round &&
        row.learningVersion === input.expectedLearningVersion &&
        row.rating === input.rating &&
        JSON.stringify(row.configuration.front) ===
            JSON.stringify(input.configuration.front) &&
        JSON.stringify(row.configuration.back) ===
            JSON.stringify(input.configuration.back)
    );
}

export interface FlashcardPersistenceContext {
    database: Database;
}
