import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { TextAiExecutionSnapshot } from '../../../application/text-ai-provider-catalog';

export const dictionaryAiConfigurationRevisionsTable = pgTable(
    'dictionary_ai_configuration_revisions',
    {
        catalogSnapshot: jsonb('catalog_snapshot')
            .$type<TextAiExecutionSnapshot>()
            .notNull(),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        createdByUserId: uuid('created_by_user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'restrict' }),
        id: uuid('id').primaryKey(),
        version: integer('version').notNull(),
    },
    (table) => [
        unique('dictionary_ai_configuration_revisions_version_unique').on(
            table.version,
        ),
        check(
            'dictionary_ai_configuration_revisions_version_positive',
            sql`${table.version} > 0`,
        ),
        check(
            'dictionary_ai_configuration_revisions_snapshot_object',
            sql`jsonb_typeof(${table.catalogSnapshot}) = 'object' and octet_length(${table.catalogSnapshot}::text) <= 16384`,
        ),
    ],
);

export const dictionaryAiConfigurationTable = pgTable(
    'dictionary_ai_configuration',
    {
        activeRevisionId: uuid('active_revision_id').references(
            () => dictionaryAiConfigurationRevisionsTable.id,
            { onDelete: 'restrict' },
        ),
        id: text('id').primaryKey().default('global'),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        version: integer('version').default(0).notNull(),
    },
    (table) => [
        check(
            'dictionary_ai_configuration_singleton',
            sql`${table.id} = 'global'`,
        ),
        check(
            'dictionary_ai_configuration_version_nonnegative',
            sql`${table.version} >= 0`,
        ),
        check(
            'dictionary_ai_configuration_revision_pair',
            sql`(${table.version} = 0 and ${table.activeRevisionId} is null) or (${table.version} > 0 and ${table.activeRevisionId} is not null)`,
        ),
    ],
);

export const dictionaryAiWorkerObservationsTable = pgTable(
    'dictionary_ai_worker_observations',
    {
        adapterRevision: text('adapter_revision').notNull(),
        checkedAt: timestamp('checked_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        expiresAt: timestamp('expires_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        id: text('id').primaryKey(),
        message: text('message').notNull(),
        modelId: text('model_id').notNull(),
        providerId: text('provider_id').notNull(),
        status: text('status').notNull(),
        workerId: text('worker_id').notNull(),
        textAiSelectionRevision: integer('text_ai_selection_revision'),
        textAiCapacityRevision: integer('text_ai_capacity_revision'),
        learningExecutionRevision: integer('learning_execution_revision'),
        creditSettlementRevision: integer('credit_settlement_revision'),
        textAiSupportedFormats: jsonb('text_ai_supported_formats').$type<
            string[]
        >(),
    },
    (table) => [
        check(
            'dictionary_ai_worker_observations_identity_bounded',
            sql`char_length(${table.id}) between 3 and 256 and char_length(${table.providerId}) between 1 and 64 and char_length(${table.modelId}) between 1 and 128 and char_length(${table.adapterRevision}) between 1 and 128 and char_length(${table.workerId}) between 1 and 160`,
        ),
        check(
            'dictionary_ai_worker_observations_status_valid',
            sql`${table.status} in ('available', 'unavailable', 'unverified')`,
        ),
        check(
            'dictionary_ai_worker_observations_formats_bounded',
            sql`${table.textAiSupportedFormats} is null or (jsonb_typeof(${table.textAiSupportedFormats}) = 'array' and octet_length(${table.textAiSupportedFormats}::text) <= 4096)`,
        ),
        check(
            'dictionary_ai_worker_observations_message_bounded',
            sql`char_length(${table.message}) between 1 and 300`,
        ),
        check(
            'dictionary_ai_worker_observations_expiry_ordered',
            sql`${table.expiresAt} > ${table.checkedAt}`,
        ),
        index('dictionary_ai_worker_observations_provider_idx').on(
            table.providerId,
            table.checkedAt,
        ),
    ],
);
