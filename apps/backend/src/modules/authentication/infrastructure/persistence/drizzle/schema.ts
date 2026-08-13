import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  userEmailsTable,
  usersTable,
} from "../../../../users/infrastructure/persistence/drizzle/schema";

const base64UrlSha256DigestCheck = (column: AnyPgColumn) =>
  sql`char_length(${column}) = 43 and ${column} ~ '^[A-Za-z0-9_-]+$'`;

const versionedHmacSha256DigestCheck = (column: AnyPgColumn) =>
  sql`char_length(${column}) between 58 and 64 and ${column} ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$'`;

export const authVerificationPurposeEnum = pgEnum("auth_verification_purpose", [
  "email_verification",
  "password_reset",
]);

export const authSessionMethodEnum = pgEnum("auth_session_method", [
  "email_verification",
  "password",
  "passkey",
]);

export const authPasskeyDeviceTypeEnum = pgEnum("auth_passkey_device_type", [
  "single_device",
  "multi_device",
]);

export const authSecurityEventOutcomeEnum = pgEnum(
  "auth_security_event_outcome",
  ["success", "failure"],
);

export const passwordCredentialsTable = pgTable(
  "password_credentials",
  {
    algorithm: text("algorithm").default("argon2id").notNull(),
    algorithmVersion: integer("algorithm_version").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    hash: text("password_hash").notNull(),
    memoryCostKiB: integer("memory_cost_kib").notNull(),
    parallelism: integer("parallelism").notNull(),
    timeCost: integer("time_cost").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    check(
      "password_credentials_argon2id_only",
      sql`${table.algorithm} = 'argon2id' and ${table.hash} ~ '^\\$argon2id\\$'`,
    ),
    check(
      "password_credentials_hash_length",
      sql`char_length(${table.hash}) between 64 and 1024`,
    ),
    check(
      "password_credentials_parameters_safe",
      sql`${table.algorithmVersion} > 0 and ${table.memoryCostKiB} >= 19456 and ${table.timeCost} >= 2 and ${table.parallelism} >= 1`,
    ),
    check(
      "password_credentials_timestamps_ordered",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const authVerificationChallengesTable = pgTable(
  "auth_verification_challenges",
  {
    attempts: integer("attempts").default(0).notNull(),
    codeDigest: text("code_digest").notNull(),
    consumedAt: timestamp("consumed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    emailId: uuid("email_id").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    flowId: uuid("flow_id").primaryKey(),
    invalidatedAt: timestamp("invalidated_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastSentAt: timestamp("last_sent_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    purpose: authVerificationPurposeEnum("purpose").notNull(),
    sendCount: integer("send_count").default(1).notNull(),
    sendWindowStartedAt: timestamp("send_window_started_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    check(
      "auth_verification_challenges_digest_format",
      versionedHmacSha256DigestCheck(table.codeDigest),
    ),
    check(
      "auth_verification_challenges_attempts_bounded",
      sql`${table.maxAttempts} = 5 and ${table.attempts} between 0 and ${table.maxAttempts}`,
    ),
    check(
      "auth_verification_challenges_sends_bounded",
      sql`${table.sendCount} between 1 and 5 and ${table.sendWindowStartedAt} <= ${table.createdAt} and ${table.createdAt} <= ${table.lastSentAt}`,
    ),
    check(
      "auth_verification_challenges_time_window",
      sql`${table.expiresAt} > ${table.createdAt} and ${table.lastSentAt} >= ${table.createdAt} and ${table.lastSentAt} < ${table.expiresAt} and ${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "auth_verification_challenges_terminal_state",
      sql`not (${table.consumedAt} is not null and ${table.invalidatedAt} is not null) and (${table.consumedAt} is null or ${table.consumedAt} >= ${table.createdAt}) and (${table.invalidatedAt} is null or ${table.invalidatedAt} >= ${table.createdAt})`,
    ),
    foreignKey({
      columns: [table.emailId, table.userId],
      foreignColumns: [userEmailsTable.id, userEmailsTable.userId],
      name: "auth_verification_challenges_email_user_fk",
    }).onDelete("cascade"),
    uniqueIndex("auth_verification_challenges_one_active_user_purpose")
      .on(table.userId, table.purpose)
      .where(
        sql`${table.consumedAt} is null and ${table.invalidatedAt} is null`,
      ),
    index("auth_verification_challenges_email_purpose_idx").on(
      table.emailId,
      table.purpose,
    ),
    index("auth_verification_challenges_expiry_idx").on(table.expiresAt),
  ],
);

export const authSessionsTable = pgTable(
  "auth_sessions",
  {
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    authenticatedAt: timestamp("authenticated_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    authenticationMethod: authSessionMethodEnum(
      "authentication_method",
    ).notNull(),
    clientLabel: text("client_label"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    familyId: uuid("family_id").notNull(),
    id: uuid("id").primaryKey(),
    lastUsedAt: timestamp("last_used_at", {
      mode: "date",
      withTimezone: true,
    }),
    predecessorSessionId: uuid("predecessor_session_id").references(
      (): AnyPgColumn => authSessionsTable.id,
      { onDelete: "restrict" },
    ),
    refreshTokenDigest: text("refresh_token_digest").notNull(),
    replayDetectedAt: timestamp("replay_detected_at", {
      mode: "date",
      withTimezone: true,
    }),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    revocationReason: text("revocation_reason"),
    rotatedAt: timestamp("rotated_at", { mode: "date", withTimezone: true }),
    rotatedToSessionId: uuid("rotated_to_session_id").references(
      (): AnyPgColumn => authSessionsTable.id,
      { onDelete: "restrict" },
    ),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    check(
      "auth_sessions_digest_format",
      base64UrlSha256DigestCheck(table.refreshTokenDigest),
    ),
    check(
      "auth_sessions_time_window",
      sql`${table.absoluteExpiresAt} > ${table.createdAt} and ${table.authenticatedAt} <= ${table.createdAt} and ${table.updatedAt} >= ${table.createdAt} and (${table.lastUsedAt} is null or ${table.lastUsedAt} >= ${table.createdAt}) and (${table.rotatedAt} is null or ${table.rotatedAt} >= ${table.createdAt}) and (${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}) and (${table.replayDetectedAt} is null or ${table.replayDetectedAt} >= ${table.createdAt})`,
    ),
    check(
      "auth_sessions_rotation_state",
      sql`(${table.rotatedAt} is null) = (${table.rotatedToSessionId} is null) and (${table.predecessorSessionId} is null or ${table.predecessorSessionId} <> ${table.id}) and (${table.rotatedToSessionId} is null or ${table.rotatedToSessionId} <> ${table.id})`,
    ),
    check(
      "auth_sessions_revocation_state",
      sql`(${table.revokedAt} is null) = (${table.revocationReason} is null) and (${table.revocationReason} is null or char_length(${table.revocationReason}) between 1 and 64) and (${table.replayDetectedAt} is null or ${table.revokedAt} is not null)`,
    ),
    check(
      "auth_sessions_client_label_length",
      sql`${table.clientLabel} is null or char_length(${table.clientLabel}) between 1 and 120`,
    ),
    uniqueIndex("auth_sessions_refresh_digest_unique").on(
      table.refreshTokenDigest,
    ),
    uniqueIndex("auth_sessions_predecessor_unique")
      .on(table.predecessorSessionId)
      .where(sql`${table.predecessorSessionId} is not null`),
    uniqueIndex("auth_sessions_rotated_to_unique")
      .on(table.rotatedToSessionId)
      .where(sql`${table.rotatedToSessionId} is not null`),
    index("auth_sessions_user_family_idx").on(table.userId, table.familyId),
    index("auth_sessions_active_user_idx")
      .on(table.userId, table.absoluteExpiresAt)
      .where(sql`${table.revokedAt} is null and ${table.rotatedAt} is null`),
  ],
);

export const authPasskeysTable = pgTable(
  "auth_passkeys",
  {
    backedUp: boolean("backed_up").notNull(),
    canonicalName: text("canonical_name").notNull(),
    counter: bigint("counter", { mode: "number" }).default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    credentialDeviceType: authPasskeyDeviceTypeEnum(
      "credential_device_type",
    ).notNull(),
    credentialId: text("credential_id").notNull(),
    id: uuid("id").primaryKey(),
    lastUsedAt: timestamp("last_used_at", {
      mode: "date",
      withTimezone: true,
    }),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    transports: text("transports")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    userHandle: text("user_handle").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    check(
      "auth_passkeys_name_length",
      sql`char_length(${table.name}) between 1 and 80`,
    ),
    check(
      "auth_passkeys_canonical_name",
      sql`${table.name} = btrim(${table.name}) and char_length(${table.canonicalName}) between 1 and 80`,
    ),
    check(
      "auth_passkeys_credential_id_format",
      sql`char_length(${table.credentialId}) between 16 and 2048 and ${table.credentialId} ~ '^[A-Za-z0-9_-]+$'`,
    ),
    check(
      "auth_passkeys_public_key_format",
      sql`char_length(${table.publicKey}) between 16 and 8192 and ${table.publicKey} ~ '^[A-Za-z0-9_-]+$'`,
    ),
    check(
      "auth_passkeys_user_handle_format",
      sql`char_length(${table.userHandle}) between 16 and 128 and ${table.userHandle} ~ '^[A-Za-z0-9_-]+$'`,
    ),
    check("auth_passkeys_counter_nonnegative", sql`${table.counter} >= 0`),
    check(
      "auth_passkeys_transports_known",
      sql`${table.transports} <@ array['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']::text[]`,
    ),
    check(
      "auth_passkeys_timestamps_ordered",
      sql`${table.updatedAt} >= ${table.createdAt} and (${table.lastUsedAt} is null or ${table.lastUsedAt} >= ${table.createdAt}) and (${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt})`,
    ),
    uniqueIndex("auth_passkeys_credential_id_unique").on(table.credentialId),
    uniqueIndex("auth_passkeys_user_canonical_name_unique")
      .on(table.userId, table.canonicalName)
      .where(sql`${table.revokedAt} is null`),
    index("auth_passkeys_active_user_idx")
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

export const authSecurityEventsTable = pgTable(
  "auth_security_events",
  {
    correlationId: text("correlation_id").notNull(),
    errorCategory: text("error_category"),
    eventType: text("event_type").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true })
      .default(sql`now() + interval '180 days'`)
      .notNull(),
    id: uuid("id").primaryKey(),
    metadata: jsonb("metadata")
      .$type<Record<string, boolean | number | string | null>>()
      .default({})
      .notNull(),
    occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    outcome: authSecurityEventOutcomeEnum("outcome").notNull(),
    sessionId: uuid("session_id").references(() => authSessionsTable.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    check(
      "auth_security_events_event_type_format",
      sql`char_length(${table.eventType}) between 2 and 64 and ${table.eventType} ~ '^[a-z][a-z0-9_.-]+$'`,
    ),
    check(
      "auth_security_events_error_category_format",
      sql`${table.errorCategory} is null or (char_length(${table.errorCategory}) between 2 and 64 and ${table.errorCategory} ~ '^[a-z][a-z0-9_.-]+$')`,
    ),
    check(
      "auth_security_events_correlation_id_length",
      sql`char_length(${table.correlationId}) between 1 and 128`,
    ),
    check(
      "auth_security_events_metadata_bounded",
      sql`octet_length(${table.metadata}::text) <= 4096`,
    ),
    check(
      "auth_security_events_retention_window",
      sql`${table.expiresAt} > ${table.occurredAt}`,
    ),
    index("auth_security_events_user_occurred_idx").on(
      table.userId,
      table.occurredAt,
    ),
    index("auth_security_events_expiry_idx").on(table.expiresAt),
    index("auth_security_events_correlation_idx").on(table.correlationId),
  ],
);
