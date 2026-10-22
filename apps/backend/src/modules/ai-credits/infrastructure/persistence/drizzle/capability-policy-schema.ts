import { sql } from 'drizzle-orm';
import {
    check,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';
import type { CapabilityPolicy } from '../../../domain/capability-policy';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export const capabilityPolicyRevisionsTable = pgTable(
    'ai_capability_policy_revisions',
    {
        id: uuid('id').primaryKey(),
        capability: text('capability')
            .$type<CapabilityPolicy['capability']>()
            .notNull(),
        version: integer('version').notNull(),
        funding: text('funding').$type<CapabilityPolicy['funding']>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        createdBy: uuid('created_by').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        reason: text('reason').notNull(),
    },
    (t) => [
        unique('ai_capability_policy_version_unique').on(
            t.capability,
            t.version,
        ),
        check('ai_capability_policy_version_positive', sql`${t.version}>0`),
        check(
            'ai_capability_policy_funding_closed',
            sql`${t.funding} in ('customer','operator')`,
        ),
        check(
            'ai_capability_policy_capability_closed',
            sql`${t.capability} in ('portrait-interview','conversation','dictionary-generation','sentence-generation','text-translation','speech')`,
        ),
        check(
            'ai_capability_policy_reason_bounded',
            sql`char_length(${t.reason}) between 5 and 500`,
        ),
    ],
);

import { jsonb } from 'drizzle-orm/pg-core';
/** Immutable snapshot shared by all attempts of one admitted feature action. */
export const actionChargingPoliciesTable = pgTable(
    'ai_action_charging_policies',
    {
        jobId: uuid('job_id').primaryKey(),
        jobKind: text('job_kind').notNull(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        policy: jsonb('policy').$type<CapabilityPolicy>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
);
export const aiAccountingSettingsRevisionsTable = pgTable(
    'ai_accounting_settings_revisions',
    {
        id: uuid('id').primaryKey(),
        version: integer('version').notNull(),
        defaultMaxCreditsPerAction: text('default_max_credits_per_action'),
        maxProviderCostUsdPerAction: text('max_provider_cost_usd_per_action'),
        maxProviderCostUsdPerAccountDay: text(
            'max_provider_cost_usd_per_account_day',
        ),
        maxProviderCostUsdPerDay: text('max_provider_cost_usd_per_day'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        createdBy: uuid('created_by').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        reason: text('reason').notNull(),
    },
    (t) => [
        check(
            'ai_accounting_settings_operator_hierarchy',
            sql`(
            ${t.maxProviderCostUsdPerAction} is null and ${t.maxProviderCostUsdPerAccountDay} is null and ${t.maxProviderCostUsdPerDay} is null
        ) or (
            ${t.maxProviderCostUsdPerAction} is not null and ${t.maxProviderCostUsdPerAccountDay} is not null and ${t.maxProviderCostUsdPerDay} is not null
            and ${t.maxProviderCostUsdPerAction} ~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$'
            and ${t.maxProviderCostUsdPerAccountDay} ~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$'
            and ${t.maxProviderCostUsdPerDay} ~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$'
            and ${t.maxProviderCostUsdPerAction}::numeric > 0
            and ${t.maxProviderCostUsdPerAction}::numeric <= ${t.maxProviderCostUsdPerAccountDay}::numeric
            and ${t.maxProviderCostUsdPerAccountDay}::numeric <= ${t.maxProviderCostUsdPerDay}::numeric
        )`,
        ),
        unique('ai_accounting_settings_version_unique').on(t.version),
        check('ai_accounting_settings_version_positive', sql`${t.version}>0`),
        check(
            'ai_accounting_settings_reason_bounded',
            sql`char_length(${t.reason}) between 5 and 500`,
        ),
    ],
);
