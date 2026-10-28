import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, inArray, notExists, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { TextAiProbe } from '@languon/contracts';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { pinProviderPrice } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { parseFixed } from '../../../../ai-credits/domain/accounting';
import { evaluateNativeProviderCost } from '../../../../ai-credits/domain/native-provider-pricing';
import { findTextAiModel } from '../../ai/text-ai-provider-catalog';
import { nativeTextPolicyFingerprint } from '../../ai/native-text-policy-identity';
import {
    TextAiProbeUnavailableError,
    type TextAiProbeLimits,
    type TextAiProbeReservation,
    type TextAiProbeResult,
    type TextAiProbeStore,
} from '../../../application/ports/text-ai-probe-store';
import {
    textAiProbesTable as probes,
    textAiProbeRecoveriesTable as recoveries,
} from './probe-schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
export type ProbeTransaction = Parameters<
    Parameters<Database['transaction']>[0]
>[0];
const usd = (value: bigint) =>
    `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
const dto = (
    row: typeof probes.$inferSelect,
    recoveredAt?: Date | null,
): TextAiProbe => ({
    recoveredAt: recoveredAt?.toISOString() ?? null,
    id: row.id,
    routeId: row.routeId,
    kind: row.kind,
    flowId: row.flowId,
    state: row.state,
    failure: row.failure,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    elapsedMs: row.elapsedMs,
    firstOutputMs: row.firstOutputMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    measurement: row.measurement,
    providerCostUsd: row.costMicros === null ? null : usd(row.costMicros),
    maximumCostUsd: usd(row.maximumMicros),
    evidenceExpiresAt: row.evidenceExpiresAt?.toISOString() ?? null,
});

export class DrizzleTextAiProbeStore implements TextAiProbeStore {
    constructor(private readonly database: Database) {}

    async reserve(
        input: Parameters<TextAiProbeStore['reserve']>[0],
    ): Promise<TextAiProbeReservation> {
        return this.database.transaction(async (tx) => {
            // Deliberately one small admin-only critical section; never on learner admission.
            await tx.execute(sql`select pg_advisory_xact_lock(1920424418)`);

            const day = input.at.toISOString().slice(0, 10);
            const [total] = await tx
                .select({
                    used: sql<string>`coalesce(sum(coalesce(${probes.costMicros},${probes.maximumMicros})),0)::text`,
                })
                .from(probes)
                .where(eq(probes.day, day));

            if (
                BigInt(total?.used ?? '0') + input.limits.maximumCostMicros >
                input.limits.dailyMaximumCostMicros
            )
                throw new TextAiProbeUnavailableError('probe_limit_reached');

            const [running] = await tx
                .select({ id: probes.id, state: probes.state })
                .from(probes)
                .where(
                    and(
                        eq(probes.providerId, input.identity.providerId),
                        or(
                            eq(probes.state, 'running'),
                            and(
                                eq(probes.state, 'failed'),
                                inArray(probes.failure, [
                                    'execution_unknown',
                                    'timeout',
                                ]),
                                notExists(
                                    tx
                                        .select({ id: recoveries.probeId })
                                        .from(recoveries)
                                        .where(
                                            eq(recoveries.probeId, probes.id),
                                        ),
                                ),
                            ),
                        ),
                    ),
                )
                .limit(1);

            if (running)
                throw new TextAiProbeUnavailableError(
                    running.state === 'running'
                        ? 'probe_busy'
                        : 'probe_recovery_required',
                );

            const [recent] = await tx
                .select({ id: probes.id })
                .from(probes)
                .where(
                    and(
                        eq(probes.routeId, input.identity.routeId),
                        gt(
                            probes.startedAt,
                            new Date(
                                input.at.getTime() -
                                    input.limits.cooldownSeconds * 1000,
                            ),
                        ),
                    ),
                )
                .limit(1);

            if (recent) throw new TextAiProbeUnavailableError('probe_cooldown');

            const price = await pinProviderPrice(tx, {
                providerId: input.identity.providerId,
                modelId: input.identity.modelId,
                meter: 'text-tokens',
                at: input.at,
            });

            if (
                !price ||
                (input.identity.providerId === 'evolink' &&
                    !price.nativeRules &&
                    (price.minimumUsdPerRequest == null ||
                        parseFixed(price.minimumUsdPerRequest, 6) <= 0n))
            )
                throw new TextAiProbeUnavailableError('probe_prices_missing');
            if (
                parseFixed(price.minimumUsdPerRequest ?? '0', 6) >
                input.limits.maximumCostMicros
            )
                throw new TextAiProbeUnavailableError(
                    'probe_budget_insufficient',
                );

            const id = randomUUID();
            const identity = price.nativeRules
                ? {
                      ...input.identity,
                      fingerprint: nativeTextPolicyFingerprint(
                          input.identity.fingerprint,
                      ),
                  }
                : input.identity;

            await tx.insert(probes).values({
                id,
                actorId: input.actorId,
                ...identity,
                kind: input.request.kind,
                flowId: input.request.flowId ?? null,
                state: 'running',
                day,
                maximumMicros: input.limits.maximumCostMicros,
                evidenceHours: input.limits.evidenceHours,
                price,
                startedAt: input.at,
            });

            return {
                id,
                identity,
                request: input.request,
                price,
                maximumCostMicros: input.limits.maximumCostMicros,
                startedAt: input.at,
            };
        });
    }

    async finish(
        reservation: TextAiProbeReservation,
        result: TextAiProbeResult,
        at: Date,
    ): Promise<TextAiProbe> {
        return this.database.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(1920424418)`);
            const [previous] = await tx
                .select()
                .from(probes)
                .where(eq(probes.id, reservation.id))
                .for('update');

            if (!previous)
                throw new TextAiProbeUnavailableError(
                    'probe_route_unavailable',
                );
            if (previous.state !== 'running') return dto(previous);

            const cost = probeCostMicros(
                previous.price,
                result,
                previous.startedAt,
            );
            const safeCost =
                cost !== null &&
                (previous.price.nativeRules || cost <= previous.maximumMicros)
                    ? cost
                    : null;
            const valid =
                result.valid &&
                (cost === null || cost <= previous.maximumMicros);
            const [saved] = await tx
                .update(probes)
                .set({
                    state: valid ? 'passed' : 'failed',
                    failure: valid
                        ? null
                        : (result.failure ?? 'execution_unknown'),
                    costMicros: safeCost,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    cacheReadTokens: result.cacheReadTokens ?? null,
                    cacheWriteTokens: result.cacheWriteTokens ?? null,
                    providerUsage: result.nativeUsage ?? null,
                    providerExecutionFacts: result.executionFacts
                        ? {
                              ...(result.executionFacts.endpointId
                                  ? {
                                        endpointId:
                                            result.executionFacts.endpointId,
                                    }
                                  : {}),
                              ...(result.executionFacts.serviceTier
                                  ? {
                                        serviceTier:
                                            result.executionFacts.serviceTier,
                                    }
                                  : {}),
                          }
                        : null,
                    measurement:
                        safeCost === null ? 'unknown' : result.measurement,
                    elapsedMs: result.elapsedMs,
                    firstOutputMs: result.firstOutputMs ?? null,
                    completedAt: at,
                    evidenceExpiresAt:
                        valid && previous.kind === 'flow'
                            ? new Date(
                                  at.getTime() +
                                      previous.evidenceHours * 60 * 60 * 1000,
                              )
                            : null,
                })
                .where(eq(probes.id, reservation.id))
                .returning();

            await tx.execute(
                sql`select languon_record_probe_provider_expense(${reservation.id}::uuid)`,
            );

            return dto(saved!);
        });
    }

    async recover(input: {
        probeId: string;
        actorId: string;
        reason: string;
        at: Date;
    }): Promise<TextAiProbe> {
        return this.database.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(1920424418)`);
            const [previous] = await tx
                .select()
                .from(probes)
                .where(eq(probes.id, input.probeId))
                .for('update');

            if (!previous)
                throw new TextAiProbeUnavailableError(
                    'probe_route_unavailable',
                );
            const [recovery] = await tx
                .select()
                .from(recoveries)
                .where(eq(recoveries.probeId, input.probeId));

            if (recovery) return dto(previous, recovery.recoveredAt);
            if (
                previous.state === 'passed' ||
                (previous.state === 'failed' &&
                    !['execution_unknown', 'timeout'].includes(
                        previous.failure ?? '',
                    ))
            )
                throw new TextAiProbeUnavailableError(
                    'probe_route_unavailable',
                );

            let saved = previous;
            if (previous.state === 'running') {
                const rows = await tx
                    .update(probes)
                    .set({
                        state: 'failed',
                        failure: 'execution_unknown',
                        measurement: 'unknown',
                        costMicros: null,
                        completedAt: input.at,
                        elapsedMs: Math.max(
                            0,
                            input.at.getTime() - previous.startedAt.getTime(),
                        ),
                    })
                    .where(eq(probes.id, input.probeId))
                    .returning();

                saved = rows[0]!;
                await tx.execute(
                    sql`select languon_record_probe_provider_expense(${input.probeId}::uuid)`,
                );
            }

            await tx.insert(recoveries).values({
                probeId: input.probeId,
                actorId: input.actorId,
                recoveredAt: input.at,
                reason: input.reason,
            });

            return dto(saved, input.at);
        });
    }

    async list(_at: Date, _limits: TextAiProbeLimits) {
        const rows = await this.database
            .select({ probe: probes, recoveredAt: recoveries.recoveredAt })
            .from(probes)
            .leftJoin(recoveries, eq(recoveries.probeId, probes.id))
            .orderBy(desc(probes.startedAt))
            .limit(100);

        return rows.map((row) => dto(row.probe, row.recoveredAt));
    }
}

export function probeCostMicros(
    price: TextAiProbeReservation['price'],
    result: TextAiProbeResult,
    dispatchedAt?: Date,
): bigint | null {
    if (
        result.failure === 'budget_insufficient' &&
        result.inputTokens === 0 &&
        result.outputTokens === 0
    )
        return 0n;
    if (price.nativeRules) {
        if (!dispatchedAt && !result.executionFacts) return null;
        const cost = evaluateNativeProviderCost(
            price.nativeRules,
            {
                ...result.executionFacts,
                dispatchedAt:
                    dispatchedAt?.toISOString() ??
                    result.executionFacts!.dispatchedAt,
            },
            {
                ...result.nativeUsage,
                requests: 1,
                ...(result.inputTokens === null
                    ? {}
                    : { inputTokens: result.inputTokens }),
                ...(result.outputTokens === null
                    ? {}
                    : { outputTokens: result.outputTokens }),
                ...(result.cacheReadTokens === undefined
                    ? {}
                    : { cacheReadTokens: result.cacheReadTokens }),
                ...(result.cacheWriteTokens === undefined
                    ? {}
                    : { cacheWriteTokens: result.cacheWriteTokens }),
            },
        );

        return cost.status === 'calculated' ? cost.micros : null;
    }

    if (
        result.measurement === 'unknown' ||
        result.inputTokens === null ||
        result.outputTokens === null
    )
        return null;
    if (
        result.failure === 'budget_insufficient' &&
        result.inputTokens === 0 &&
        result.outputTokens === 0
    )
        return 0n;
    const read = result.cacheReadTokens ?? 0,
        write = result.cacheWriteTokens ?? 0;

    if (
        read + write > result.inputTokens ||
        (read > 0 && price.cacheReadUsdPerMillionTokens === null) ||
        (write > 0 && price.cacheWriteUsdPerMillionTokens === null) ||
        price.inputUsdPerMillionTokens === null ||
        price.outputUsdPerMillionTokens === null
    )
        return null;
    const numerator =
        BigInt(result.inputTokens - read - write) *
            parseFixed(price.inputUsdPerMillionTokens, 6) +
        BigInt(result.outputTokens) *
            parseFixed(price.outputUsdPerMillionTokens, 6) +
        BigInt(read) *
            parseFixed(price.cacheReadUsdPerMillionTokens ?? '0', 6) +
        BigInt(write) *
            parseFixed(price.cacheWriteUsdPerMillionTokens ?? '0', 6);

    const tokens = (numerator + 999_999n) / 1_000_000n;
    const minimum = parseFixed(price.minimumUsdPerRequest ?? '0', 6);

    return tokens > minimum ? tokens : minimum;
}

export async function requireProbeReady(
    tx: ProbeTransaction,
    input: { routeId: string; flowId: string; now: Date; fingerprint: string },
) {
    const model = findTextAiModel(input.routeId);
    const currentPrice = model
        ? await pinProviderPrice(tx, {
              providerId: model.providerId,
              modelId: model.modelId,
              meter: 'text-tokens',
              at: input.now,
          })
        : null;
    const expected = {
        ...input,
        fingerprint: currentPrice?.nativeRules
            ? nativeTextPolicyFingerprint(input.fingerprint)
            : input.fingerprint,
    };
    const [latest] = await tx
        .select()
        .from(probes)
        .where(
            and(
                eq(probes.routeId, input.routeId),
                eq(probes.flowId, input.flowId),
                eq(probes.kind, 'flow'),
            ),
        )
        .orderBy(sql`${probes.startedAt} desc nulls last`)
        .limit(1);

    if (
        !latest ||
        latest.state !== 'passed' ||
        latest.fingerprint !== expected.fingerprint ||
        !latest.evidenceExpiresAt ||
        latest.evidenceExpiresAt <= input.now ||
        !(await isProbeDispatchAllowed(tx, expected))
    )
        throw new TextAiProbeUnavailableError('probe_check_required');
}

export async function isProbeDispatchAllowed(
    tx: ProbeTransaction,
    input: { routeId: string; flowId: string; now: Date; fingerprint: string },
): Promise<boolean> {
    const rows = await tx.execute(
        sql`select languon_text_ai_route_dispatch_allowed(${input.routeId},${input.flowId},${input.fingerprint},${input.now.toISOString()}::timestamptz) as allowed`,
    );

    return rows[0]?.allowed === true;
}

export const requireTextAiProbeEvidence = requireProbeReady;
