import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type { TextAiExecutionSnapshot as DictionaryAiExecutionSnapshot } from '../../../../text-ai/application/text-ai-provider-catalog';
import type { DictionaryOperationContext } from '../../../application/ports/dictionary-store';
import { type DictionaryGenerationProviderBudgetPolicy } from '../../../application/ports/dictionary-generation-provider-policy';
import type {
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionarySettingsTable,
} from './schema';

export type Database = PostgresJsDatabase<typeof databaseSchema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type JobRow = typeof dictionaryGenerationJobsTable.$inferSelect;

export type ProviderExecution = {
    budget: DictionaryGenerationProviderBudgetPolicy;
    revisionId: string | null;
    snapshot: DictionaryAiExecutionSnapshot | null;
    selectionVersion: 1 | null;
};

export type ProposalRow =
    typeof dictionaryGenerationProposalsTable.$inferSelect;

export type CardRow = typeof dictionaryCardsTable.$inferSelect;

export type SettingsRow = typeof dictionarySettingsTable.$inferSelect;

export const generationLimits = {
    globalQueued: 1_000,
    maxRunnableQueueAgeMs: 300_000,
    ownerQueued: 5,
} as const;

export const bulkIdempotencyLifetimeMs = 24 * 60 * 60 * 1_000;

export const providerOperationalBudget = {
    circuitFailureThreshold: 3,
    circuitOpenMs: 60_000,
    dailyGlobalAttempts: 20,
    dailyOwnerAttempts: 3,
    globalActiveAttempts: 10,
    ownerActiveAttempts: 3,
} as const;

export function abort(context: DictionaryOperationContext): void {
    context.signal.throwIfAborted();
}

export interface DictionaryGenerationIdGenerator {
    generate(): string;
}

export interface GenerationStoreContext {
    database: Database;
    ids: DictionaryGenerationIdGenerator;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    aiCreditEnforcementEnabled: boolean;
}
