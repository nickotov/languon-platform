import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { type DictionaryGenerationProviderBudgetPolicy } from '../../../application/ports/dictionary-generation-provider-policy';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { type DictionaryDocumentMediaType } from '../../../domain/document-ingestion';
import { type DictionaryGenerationIdGenerator } from './drizzle-dictionary-generation-store';
import type {
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
} from './schema';

export type Database = PostgresJsDatabase<typeof databaseSchema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type UploadRow = typeof dictionaryDocumentUploadsTable.$inferSelect;

export type DocumentJobRow = typeof dictionaryGenerationJobsTable.$inferSelect;

export const documentAdmissionLock = 4_312_189_073;

export const documentQuota = {
    globalBytes: 1_024 * 1_024 * 1_024,
    globalUploads: 50,
    ownerBytes: 100 * 1_024 * 1_024,
    ownerUploads: 5,
} as const;

export const documentQueueQuota = { global: 1_000, owner: 5 } as const;

export const formatByMediaType: Record<DictionaryDocumentMediaType, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'text/markdown': 'markdown',
    'text/plain': 'txt',
};

export interface DictionaryDocumentPersistenceContext {
    readonly database: Database;
    readonly ids: DictionaryGenerationIdGenerator;
    readonly generationStore: DictionaryGenerationStore;
    readonly providerBudget: DictionaryGenerationProviderBudgetPolicy;
    readonly aiCreditEnforcementEnabled: boolean;
}
