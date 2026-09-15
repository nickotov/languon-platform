import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', [
    'pending',
    'active',
    'disabled',
    'deletion_pending',
    'purged',
]);

export const usersTable = pgTable(
    'users',
    {
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        id: uuid('id').primaryKey(),
        handle: text('handle'),
        status: userStatusEnum('status').default('pending').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        version: integer('version').default(1).notNull(),
    },
    (table) => [
        check('users_version_positive', sql`${table.version} > 0`),
        check('users_handle_format', sql`${table.handle} is null or ${table.handle} ~ '^[a-z0-9_]{3,30}$'`),
        uniqueIndex('users_handle_unique').on(table.handle),
        index('users_status_idx').on(table.status),
    ],
);

export const userEmailsTable = pgTable(
    'user_emails',
    {
        canonicalEmail: text('canonical_email').notNull(),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        email: text('email').notNull(),
        id: uuid('id').primaryKey(),
        isPrimary: boolean('is_primary').default(true).notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        userId: uuid('user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        verifiedAt: timestamp('verified_at', {
            mode: 'date',
            withTimezone: true,
        }),
    },
    (table) => [
        check(
            'user_emails_email_length',
            sql`char_length(${table.email}) between 3 and 320`,
        ),
        check(
            'user_emails_canonical_email_length',
            sql`char_length(${table.canonicalEmail}) between 3 and 320`,
        ),
        check(
            'user_emails_canonical_matches_email',
            sql`${table.canonicalEmail} = lower(btrim(${table.email}))`,
        ),
        uniqueIndex('user_emails_canonical_email_unique').on(
            table.canonicalEmail,
        ),
        unique('user_emails_id_user_id_unique').on(table.id, table.userId),
        uniqueIndex('user_emails_one_primary_per_user')
            .on(table.userId)
            .where(sql`${table.isPrimary} = true`),
        index('user_emails_user_id_idx').on(table.userId),
    ],
);
