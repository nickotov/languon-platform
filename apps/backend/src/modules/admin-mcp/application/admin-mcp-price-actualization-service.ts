import { z } from 'zod';
import {
    adminMcpReasonSchema,
    ProviderPricePublishRequestSchema,
    type ProviderPrice,
} from '@languon/contracts';
import type {
    ProviderPriceSource,
    ProviderPriceTarget,
    ProviderPriceFetchResult,
} from '../../ai-credits/application/provider-price-source';
import {
    assertSafeAuditContext,
    requireAction,
    requirePermission,
    AdminMcpError,
    type AdminMcpActor,
} from '../domain/admin-mcp';
import type { AdminMcpAdministrationService } from './admin-mcp-administration-service';
import type { AdminMcpAdministrationPort } from './ports/admin-mcp-administration-port';

const targetSchema = z
    .object({
        providerId: z.string().trim().min(1).max(200),
        modelId: z.string().trim().min(1).max(200),
        meter: z.enum(['text-tokens', 'speech-characters']),
    })
    .strict();
export const actualizeModelPricesSchema = z
    .object({
        reason: adminMcpReasonSchema,
        models: z.array(targetSchema).min(1).max(50).optional(),
        offset: z.number().int().min(0).max(2147483647).optional(),
    })
    .strict()
    .refine((input) => !(input.models && input.offset !== undefined), {
        message:
            'Use an explicit model selection or a discovery offset, not both.',
    });

export interface PriceActualizationDependencies {
    sources: readonly ProviderPriceSource[];
    targets(): Promise<ProviderPriceTarget[]>;
    prices(): Promise<ProviderPrice[]>;
    administration: Pick<AdminMcpAdministrationService, 'preview'>;
    reauthenticate(): Promise<AdminMcpActor>;
    audit: Pick<AdminMcpAdministrationPort, 'recordRead' | 'recordRejected'>;
    now?: () => Date;
}
const key = (target: ProviderPriceTarget) =>
    JSON.stringify([target.providerId, target.modelId, target.meter]);
const rateFields = [
    'inputUsdPerMillionTokens',
    'outputUsdPerMillionTokens',
    'cacheReadUsdPerMillionTokens',
    'cacheWriteUsdPerMillionTokens',
    'usdPer1000Characters',
    'minimumUsdPerRequest',
] as const;
function normalized(value: string | null | undefined) {
    if (value == null) return null;
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

/** Fetch outside transactions; publish only through the existing exact preview/apply boundary. */
export class AdminMcpPriceActualizationService {
    constructor(private readonly deps: PriceActualizationDependencies) {
        const ids = deps.sources.map((source) => source.providerId);
        if (new Set(ids).size !== ids.length)
            throw new Error('Duplicate provider price source.');
    }

    async actualize(actor: AdminMcpActor, raw: unknown, signal?: AbortSignal) {
        try {
            const deadline = AbortSignal.timeout(60_000);
            const boundedSignal = signal
                ? AbortSignal.any([signal, deadline])
                : deadline;
            const value = await this.prepare(actor, raw, boundedSignal);
            const input = actualizeModelPricesSchema.parse(raw);
            await this.deps.audit.recordRead(
                actor,
                'provider-prices.actualize',
                input,
                value,
                input.reason,
            );
            return value;
        } catch (error) {
            await this.deps.audit.recordRejected(
                actor,
                'provider-prices.actualize',
                raw,
                error,
            );
            throw error;
        }
    }

    private async prepare(
        actor: AdminMcpActor,
        raw: unknown,
        signal?: AbortSignal,
    ) {
        this.authorize(actor);
        const input = actualizeModelPricesSchema.parse(raw);
        assertSafeAuditContext(input);
        const available = new Map(
            (await this.deps.targets()).map((t) => [key(t), t]),
        );
        const discovered = [...available.values()];
        const offset = input.offset ?? 0;
        const targets = input.models
            ? [...new Map(input.models.map((t) => [key(t), t])).values()]
            : discovered.slice(offset, offset + 50);
        const nextOffset =
            !input.models && offset + targets.length < discovered.length
                ? offset + targets.length
                : null;
        if (targets.some((t) => !available.has(key(t))))
            throw new AdminMcpError(
                'not_found',
                'Select configured active catalog models only.',
            );
        const sources = new Map(
            this.deps.sources.map((s) => [s.providerId, s]),
        );
        const fetched: ProviderPriceFetchResult[] = [];
        // Sequential provider batches bound concurrency. One failed provider does not discard another.
        for (const providerId of new Set(targets.map((t) => t.providerId))) {
            signal?.throwIfAborted();
            const batch = targets.filter((t) => t.providerId === providerId);
            const source = sources.get(providerId);
            if (!source) {
                fetched.push(
                    ...batch.map((target) => ({
                        target,
                        status: 'unsupported' as const,
                        reason: 'No reviewed automatic pricing adapter for this provider.',
                    })),
                );
                continue;
            }
            try {
                const results = await source.fetchPrices(batch, signal);
                // A source must return exactly one result for each requested target.
                for (const target of batch) {
                    const matching = results.filter(
                        (r) => key(r.target) === key(target),
                    );
                    fetched.push(
                        matching.length === 1
                            ? matching[0]!
                            : {
                                  target,
                                  status: 'unavailable',
                                  reason: 'Incomplete provider pricing response.',
                              },
                    );
                }
            } catch {
                signal?.throwIfAborted();
                fetched.push(
                    ...batch.map((target) => ({
                        target,
                        status: 'unavailable' as const,
                        reason: 'Official pricing could not be fetched or validated.',
                    })),
                );
            }
        }
        signal?.throwIfAborted();
        // Refresh authority after network work, including when all entries are unchanged.
        const currentActor = await this.deps.reauthenticate();
        this.authorize(currentActor);
        if (
            currentActor.tokenId !== actor.tokenId ||
            currentActor.userId !== actor.userId
        )
            throw new AdminMcpError(
                'unauthorized',
                'Credential identity changed.',
            );
        const prices = new Map(
            (await this.deps.prices()).map((p) => [key(p), p]),
        );
        const at = (this.deps.now?.() ?? new Date()).toISOString();
        const results = [];
        for (const item of fetched) {
            signal?.throwIfAborted();
            if (item.status !== 'available') {
                results.push(item);
                continue;
            }
            const current = prices.get(key(item.target));
            if (current && Date.parse(current.effectiveAt) > Date.parse(at)) {
                results.push({
                    target: item.target,
                    status: 'skipped',
                    reason: 'A future price revision is already scheduled.',
                });
                continue;
            }
            const proposed = ProviderPricePublishRequestSchema.safeParse({
                ...item.price,
                expectedVersion: current?.version ?? 0,
                effectiveAt: at,
                reason: input.reason,
            });
            if (!proposed.success || key(proposed.data) !== key(item.target)) {
                results.push({
                    target: item.target,
                    status: 'unavailable',
                    reason: 'Official price is incompatible with the accounting schema.',
                });
                continue;
            }
            if (
                current &&
                rateFields.every(
                    (field) =>
                        normalized(current[field]) ===
                        normalized(proposed.data[field]),
                )
            ) {
                results.push({
                    target: item.target,
                    status: 'unchanged',
                    sourceUrl: item.price.sourceUrl,
                    fetchedAt: at,
                });
                continue;
            }
            try {
                const preview = await this.deps.administration.preview(
                    currentActor,
                    'provider-prices.write',
                    proposed.data,
                );
                results.push({
                    target: item.target,
                    status: 'preview',
                    fetchedAt: at,
                    preview,
                });
            } catch {
                // Includes stale versions/revocation. A later apply rechecks live authority again.
                results.push({
                    target: item.target,
                    status: 'unavailable',
                    reason: 'Price preview rejected; refresh authority and current revisions before retrying.',
                });
            }
        }
        return {
            fetchedAt: at,
            applied: false,
            totalModels: input.models ? targets.length : discovered.length,
            nextOffset,
            results,
            nextStep:
                'Apply each returned preview with admin_apply and a stable UUID operationKey before continuing. When nextOffset is non-null, call actualize_model_prices with that offset and the same reason, omitting models. Continue until nextOffset is null. No price has been published by this tool.',
        };
    }

    private authorize(actor: AdminMcpActor) {
        requirePermission(actor, 'provider-prices.write');
        requireAction(actor, 'provider-prices.actualize');
        requireAction(actor, 'provider-prices.write');
    }
}
