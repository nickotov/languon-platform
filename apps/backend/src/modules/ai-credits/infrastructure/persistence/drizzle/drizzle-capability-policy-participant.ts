import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AdminAccessDeniedError } from '../../../../administration/application/administration-errors';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../../../administration/infrastructure/persistence/drizzle/schema';
import {
    AiCapabilitySchema,
    CapabilityPolicyPublishSchema,
    type CapabilityPolicy,
} from '@languon/contracts';
import { initialCapabilityPolicy } from '../../../domain/capability-policy';
import type { AiCreditTransaction } from './drizzle-ai-credit-participant';
import { capabilityPolicyRevisionsTable as policies } from './capability-policy-schema';

export class CapabilityPolicyConflictError extends Error {}
export class DrizzleCapabilityPolicyParticipant {
    constructor(private readonly tx: AiCreditTransaction) {}
    async current(
        capability: CapabilityPolicy['capability'],
    ): Promise<CapabilityPolicy> {
        const [row] = await this.tx
            .select()
            .from(policies)
            .where(eq(policies.capability, capability))
            .orderBy(desc(policies.version))
            .limit(1);

        return row
            ? {
                  capability: row.capability,
                  version: row.version,
                  revisionId: row.id,
                  funding: row.funding,
                  updatedAt: row.createdAt.toISOString(),
              }
            : initialCapabilityPolicy(capability);
    }

    async pinAction(input: {
        jobId: string;
        jobKind: AiCreditJobKind;
        ownerId: string;
        at: Date;
        policy?: CapabilityPolicy;
    }): Promise<CapabilityPolicy> {
        const [existing] = await this.tx
            .select()
            .from(actionChargingPoliciesTable)
            .where(eq(actionChargingPoliciesTable.jobId, input.jobId));

        if (existing) {
            if (
                existing.ownerId !== input.ownerId ||
                existing.jobKind !== input.jobKind
            )
                throw new CapabilityPolicyConflictError();

            return existing.policy;
        }

        const policy =
            input.policy ??
            (await this.current(capabilityForJob(input.jobKind)));

        if (policy.capability !== capabilityForJob(input.jobKind))
            throw new CapabilityPolicyConflictError();
        await this.tx
            .insert(actionChargingPoliciesTable)
            .values({
                jobId: input.jobId,
                jobKind: input.jobKind,
                ownerId: input.ownerId,
                policy,
                createdAt: input.at,
            })
            .onConflictDoNothing();

        const [pinned] = await this.tx
            .select()
            .from(actionChargingPoliciesTable)
            .where(eq(actionChargingPoliciesTable.jobId, input.jobId));

        if (
            !pinned ||
            pinned.ownerId !== input.ownerId ||
            pinned.jobKind !== input.jobKind
        )
            throw new CapabilityPolicyConflictError();

        return pinned.policy;
    }

    async settings(): Promise<z.infer<typeof AiAccountingSettingsSchema>> {
        const [row] = await this.tx
            .select()
            .from(aiAccountingSettingsRevisionsTable)
            .orderBy(desc(aiAccountingSettingsRevisionsTable.version))
            .limit(1);

        return AiAccountingSettingsSchema.parse(
            row
                ? {
                      version: row.version,
                      defaultMaxCreditsPerAction:
                          row.defaultMaxCreditsPerAction,
                      maxProviderCostUsdPerAction:
                          row.maxProviderCostUsdPerAction,
                      maxProviderCostUsdPerAccountDay:
                          row.maxProviderCostUsdPerAccountDay,
                      maxProviderCostUsdPerDay: row.maxProviderCostUsdPerDay,
                  }
                : { version: 0, defaultMaxCreditsPerAction: null },
        );
    }

    async publishSettings(
        raw: z.input<typeof AiAccountingSettingsPublishSchema>,
        actorId: string,
        at: Date,
        correlationId = randomUUID(),
    ) {
        const input = AiAccountingSettingsPublishSchema.parse(raw);
        const [membership] = await this.tx
            .select({ role: adminMembershipsTable.role })
            .from(adminMembershipsTable)
            .innerJoin(
                usersTable,
                eq(usersTable.id, adminMembershipsTable.userId),
            )
            .where(
                and(
                    eq(adminMembershipsTable.userId, actorId),
                    isNull(adminMembershipsTable.revokedAt),
                    eq(usersTable.status, 'active'),
                ),
            )
            .for('share');

        if (membership?.role !== 'owner') throw new AdminAccessDeniedError();
        await this.tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended('ai-accounting-settings', 1920424383))`,
        );

        const before = await this.settings();
        if (before.version !== input.expectedVersion)
            throw new CapabilityPolicyConflictError();
        await this.tx.insert(aiAccountingSettingsRevisionsTable).values({
            id: randomUUID(),
            version: before.version + 1,
            defaultMaxCreditsPerAction: input.defaultMaxCreditsPerAction,
            maxProviderCostUsdPerAction: input.maxProviderCostUsdPerAction,
            maxProviderCostUsdPerAccountDay:
                input.maxProviderCostUsdPerAccountDay,
            maxProviderCostUsdPerDay: input.maxProviderCostUsdPerDay,
            createdAt: at,
            createdBy: actorId,
            reason: input.reason,
        });

        const result = await this.settings();
        await this.tx.insert(adminAuditEventsTable).values({
            id: randomUUID(),
            actorUserId: actorId,
            action: 'ai_settings_updated',
            outcome: 'success',
            reason: input.reason,
            correlationId,
            occurredAt: at,
            expiresAt: new Date(at.getTime() + 365 * 86400_000),
            beforeVersion: before.version,
            afterVersion: result.version,
            metadata: {
                defaultMaxCreditsPerAction: result.defaultMaxCreditsPerAction,
                maxProviderCostUsdPerAction: result.maxProviderCostUsdPerAction,
                maxProviderCostUsdPerAccountDay:
                    result.maxProviderCostUsdPerAccountDay,
                maxProviderCostUsdPerDay: result.maxProviderCostUsdPerDay,
            },
        });

        return result;
    }

    async list() {
        return Promise.all(
            AiCapabilitySchema.options.map((capability) =>
                this.current(capability),
            ),
        );
    }

    async publish(
        raw: z.infer<typeof CapabilityPolicyPublishSchema>,
        actorId: string,
        at: Date,
        correlationId = randomUUID(),
    ) {
        const input = CapabilityPolicyPublishSchema.parse(raw);
        const [membership] = await this.tx
            .select({ role: adminMembershipsTable.role })
            .from(adminMembershipsTable)
            .innerJoin(
                usersTable,
                eq(usersTable.id, adminMembershipsTable.userId),
            )
            .where(
                and(
                    eq(adminMembershipsTable.userId, actorId),
                    isNull(adminMembershipsTable.revokedAt),
                    eq(usersTable.status, 'active'),
                ),
            )
            .for('share');

        if (membership?.role !== 'owner') throw new AdminAccessDeniedError();
        await this.tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${input.capability}, 1920424383))`,
        );

        const before = await this.current(input.capability);
        if (before.version !== input.expectedVersion)
            throw new CapabilityPolicyConflictError();
        await this.tx.insert(policies).values({
            id: randomUUID(),
            capability: input.capability,
            funding: input.funding,
            version: before.version + 1,
            createdAt: at,
            createdBy: actorId,
            reason: input.reason,
        });

        const result = await this.current(input.capability);
        await this.tx.insert(adminAuditEventsTable).values({
            id: randomUUID(),
            actorUserId: actorId,
            action: 'ai_settings_updated',
            outcome: 'success',
            reason: input.reason,
            correlationId,
            occurredAt: at,
            expiresAt: new Date(at.getTime() + 365 * 86400_000),
            beforeVersion: before.version,
            afterVersion: result.version,
            metadata: {
                capability: input.capability,
                funding: input.funding,
                revisionId: result.revisionId,
            },
        });

        return result;
    }
}

import {
    AiAccountingSettingsPublishSchema,
    AiAccountingSettingsSchema,
} from '@languon/contracts';
import {
    actionChargingPoliciesTable,
    aiAccountingSettingsRevisionsTable,
} from './capability-policy-schema';
import type { AiCreditJobKind } from '../../../application/ai-credit-participant';

export function capabilityForJob(
    jobKind: AiCreditJobKind,
): CapabilityPolicy['capability'] {
    switch (jobKind) {
        case 'portrait-interview':
            return 'portrait-interview';
        case 'conversation-turn':
            return 'conversation';
        case 'speech-generation':
            return 'speech';
        case 'dictionary-generation':
            return 'dictionary-generation';
        case 'sentence-generation':
        case 'sentence-check':
            return 'sentence-generation';
        case 'text-detection':
        case 'text-translation':
        case 'text-selection-card':
            return 'text-translation';
    }
}
