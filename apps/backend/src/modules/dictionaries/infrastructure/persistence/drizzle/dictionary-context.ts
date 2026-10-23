import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { type DictionaryOwnerLimits } from '../../../domain/limits';
import type { DictionaryIdGenerator } from './dictionary-id-generator';
import type {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

export type DictionaryDatabase = PostgresJsDatabase<typeof databaseSchema>;

export type DictionaryTransaction = Parameters<
    Parameters<DictionaryDatabase['transaction']>[0]
>[0];

export type QueryDatabase = DictionaryDatabase | DictionaryTransaction;

export const idempotencyLifetimeMs = 24 * 60 * 60 * 1_000;

export type DictionaryRow = typeof dictionariesTable.$inferSelect;

export type SettingsRow = typeof dictionarySettingsTable.$inferSelect;

export type CardRow = typeof dictionaryCardsTable.$inferSelect;

export interface DictionaryPersistenceContext {
    readonly database: DictionaryDatabase;
    readonly ids: DictionaryIdGenerator;
    readonly ownerLimits: DictionaryOwnerLimits;
}
