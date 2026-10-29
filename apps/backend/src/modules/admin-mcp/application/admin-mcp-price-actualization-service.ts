import { z } from 'zod';
import {
    adminMcpReasonSchema,
    ProviderPricePublishRequestSchema,
    type ProviderPrice,
    type ProviderPricePublishRequest,
} from '@languon/contracts';
import type {
    ProviderPriceSource,
    ProviderPriceTarget,
    ProviderPriceFetchResult,
    FetchedProviderPrice,
} from '../../ai-credits/application/provider-price-source';
import {
    assertSafeAuditContext,
    requireAction,
    requirePermission,
    AdminMcpError,
    type AdminMcpActor,
    type AdminMcpPreview,
} from '../domain/admin-mcp';
import type { AdminMcpAdministrationService } from './admin-mcp-administration-service';
import type { AdminMcpAdministrationPort } from './ports/admin-mcp-administration-port';

const targetSchema = z
    .object({
        providerId: z.string().trim().min(1).max(200),
        modelId: z.string().trim().min(1).max(200),
        meter: z.enum([
            'text-tokens',
            'speech-characters',
            'speech-tokens',
            'audio-duration',
        ]),
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
export interface PriceCatalogEntry {
    target: ProviderPriceTarget;
    configured: boolean;
    retired: boolean;
    executionBlockers: string[];
}
export interface PriceActualizationDependencies {
    sources: readonly ProviderPriceSource[];
    targets(): Promise<ProviderPriceTarget[]>;
    catalog?(): Promise<PriceCatalogEntry[]>;
    prices(): Promise<ProviderPrice[]>;
    administration: Pick<AdminMcpAdministrationService, 'preview'>;
    reauthenticate(): Promise<AdminMcpActor>;
    audit: Pick<AdminMcpAdministrationPort, 'recordRead' | 'recordRejected'>;
    now?: () => Date;
}
export interface ModelPriceResult {
    target: ProviderPriceTarget;
    status:
        | 'preview'
        | 'unchanged'
        | 'verified'
        | 'skipped'
        | 'unsupported'
        | 'unavailable'
        | 'model-not-found'
        | 'source-changed';
    catalog: { configured: boolean; retired: boolean };
    verification:
        | 'verified'
        | 'source-unavailable'
        | 'model-not-found'
        | 'source-changed'
        | 'unsupported';
    publication:
        'ready' | 'retired' | 'scheduled-revision-preserved' | 'not-ready';
    executionReadiness: {
        assessedByPriceVerification: false;
        knownBlockers: string[];
    };
    comparison?: 'matches' | 'differs' | 'missing';
    reason?: string;
    pricing?: FetchedProviderPrice;
    sourceUrl?: string | null;
    fetchedAt?: string;
    preview?: AdminMcpPreview;
}
export const priceTargetKey = (target: ProviderPriceTarget) =>
    JSON.stringify([target.providerId, target.modelId, target.meter]);
const rateFields = [
    'inputUsdPerMillionTokens',
    'outputUsdPerMillionTokens',
    'cacheReadUsdPerMillionTokens',
    'cacheWriteUsdPerMillionTokens',
    'usdPer1000Characters',
    'minimumUsdPerRequest',
] as const;
function decimal(value: string | null | undefined) {
    if (value == null) return null;
    const [whole, fraction = ''] = value.split('.');
    const significant = fraction.replace(/0+$/, '');
    return significant ? `${whole}.${significant}` : whole;
}
function canonical(value: unknown): string {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
        .filter((key) => object[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
        .join(',')}}`;
}
/** Retrieval time alone never creates another monetary revision. Actual validity changes still do. */
export function sameProviderPricing(
    current: ProviderPrice,
    proposed: ProviderPricePublishRequest,
    at: string,
) {
    if (Boolean(current.nativeRules) !== Boolean(proposed.nativeRules))
        return false;
    if (current.nativeRules && proposed.nativeRules) {
        if (
            current.nativeRules.validUntil &&
            Date.parse(current.nativeRules.validUntil) <= Date.parse(at)
        )
            return false;
        return (
            canonical({ ...current.nativeRules, validFrom: undefined }) ===
            canonical({ ...proposed.nativeRules, validFrom: undefined })
        );
    }
    return rateFields.every(
        (field) => decimal(current[field]) === decimal(proposed[field]),
    );
}

/** Source verification is independent from publication and execution activation. */
export class AdminMcpPriceActualizationService {
    constructor(private readonly deps: PriceActualizationDependencies) {
        const ids = deps.sources.map((source) => source.providerId);
        if (new Set(ids).size !== ids.length)
            throw new Error('Duplicate provider price source.');
    }
    actualize(actor: AdminMcpActor, raw: unknown, signal?: AbortSignal) {
        return this.run(actor, raw, 'actualize', signal);
    }
    verify(actor: AdminMcpActor, raw: unknown, signal?: AbortSignal) {
        return this.run(actor, raw, 'verify', signal);
    }
    private async run(
        actor: AdminMcpActor,
        raw: unknown,
        mode: 'actualize' | 'verify',
        signal?: AbortSignal,
    ) {
        const operation =
            mode === 'verify'
                ? 'provider-prices.verify'
                : 'provider-prices.actualize-native.v1';
        try {
            this.authorize(actor, mode);
            const input = actualizeModelPricesSchema.parse(raw);
            assertSafeAuditContext(input);
            const deadline = AbortSignal.timeout(60_000);
            const bounded = signal
                ? AbortSignal.any([signal, deadline])
                : deadline;
            const catalog = this.deps.catalog
                ? await this.deps.catalog()
                : (await this.deps.targets()).map((target) => ({
                      target,
                      configured: true,
                      retired: false,
                      executionBlockers: [],
                  }));
            const entries = new Map(
                catalog.map((entry) => [priceTargetKey(entry.target), entry]),
            );
            const discovered = [...entries.values()].map(
                (entry) => entry.target,
            );
            const offset = input.offset ?? 0;
            const targets = input.models
                ? [
                      ...new Map(
                          input.models.map((target) => [
                              priceTargetKey(target),
                              target,
                          ]),
                      ).values(),
                  ]
                : discovered.slice(offset, offset + 50);
            if (targets.some((target) => !entries.has(priceTargetKey(target))))
                throw new AdminMcpError(
                    'not_found',
                    'Select real catalog models only.',
                );
            const fetched = await this.fetch(targets, bounded);
            bounded.throwIfAborted();
            const fresh = await this.deps.reauthenticate();
            this.authorize(fresh, mode);
            if (
                fresh.tokenId !== actor.tokenId ||
                fresh.userId !== actor.userId
            )
                throw new AdminMcpError(
                    'unauthorized',
                    'Credential identity changed.',
                );
            const prices = new Map(
                (await this.deps.prices()).map((price) => [
                    priceTargetKey(price),
                    price,
                ]),
            );
            const at = (this.deps.now?.() ?? new Date()).toISOString();
            const results: ModelPriceResult[] = [];
            for (const item of fetched) {
                bounded.throwIfAborted();
                const entry = entries.get(priceTargetKey(item.target))!;
                const base = {
                    target: item.target,
                    catalog: {
                        configured: entry.configured,
                        retired: entry.retired,
                    },
                    executionReadiness: {
                        assessedByPriceVerification: false as const,
                        knownBlockers: entry.executionBlockers,
                    },
                };
                if (item.status !== 'available') {
                    results.push({
                        ...base,
                        status: item.status,
                        reason: item.reason,
                        verification:
                            item.status === 'unavailable'
                                ? 'source-unavailable'
                                : item.status,
                        publication: entry.retired ? 'retired' : 'not-ready',
                    });
                    continue;
                }
                const current = prices.get(priceTargetKey(item.target));
                const parsed = ProviderPricePublishRequestSchema.safeParse({
                    ...item.price,
                    expectedVersion: current?.version ?? 0,
                    effectiveAt: at,
                    reason: input.reason,
                });
                if (
                    !parsed.success ||
                    priceTargetKey(parsed.data) !==
                        priceTargetKey(item.target) ||
                    (parsed.data.nativeRules?.validUntil &&
                        Date.parse(parsed.data.nativeRules.validUntil) <=
                            Date.parse(at))
                ) {
                    results.push({
                        ...base,
                        status: 'source-changed',
                        verification: 'source-changed',
                        reason: 'Official rates, identity or validity do not match the supported native contract.',
                        publication: 'not-ready',
                    });
                    continue;
                }
                const scheduled =
                    current && Date.parse(current.effectiveAt) > Date.parse(at);
                const matches = current
                    ? sameProviderPricing(current, parsed.data, at)
                    : false;
                const ready = !entry.retired && !scheduled;
                const verified = {
                    ...base,
                    verification: 'verified' as const,
                    comparison: current
                        ? matches
                            ? ('matches' as const)
                            : ('differs' as const)
                        : ('missing' as const),
                    publication: entry.retired
                        ? ('retired' as const)
                        : scheduled
                          ? ('scheduled-revision-preserved' as const)
                          : ('ready' as const),
                    pricing: item.price,
                    sourceUrl: item.price.sourceUrl,
                    fetchedAt: at,
                };
                if (mode === 'verify') {
                    results.push({ ...verified, status: 'verified' });
                    continue;
                }
                if (!ready) {
                    results.push({
                        ...verified,
                        status: 'skipped',
                        reason: entry.retired
                            ? 'Retired entries are verified without reactivation or publication.'
                            : 'A future price revision is already scheduled.',
                    });
                    continue;
                }
                if (matches) {
                    results.push({ ...verified, status: 'unchanged' });
                    continue;
                }
                try {
                    const write = parsed.data.nativeRules
                        ? 'provider-prices.native-write'
                        : 'provider-prices.write';
                    const preview = await this.deps.administration.preview(
                        fresh,
                        write,
                        parsed.data,
                    );
                    results.push({ ...verified, status: 'preview', preview });
                } catch {
                    results.push({
                        ...verified,
                        status: 'unavailable',
                        publication: 'not-ready',
                        reason: 'Price preview rejected; refresh delegated authority and current revisions before retrying.',
                    });
                }
            }
            const nextOffset =
                !input.models && offset + targets.length < discovered.length
                    ? offset + targets.length
                    : null;
            const value = {
                fetchedAt: at,
                applied: false,
                mode,
                totalModels: input.models ? targets.length : discovered.length,
                nextOffset,
                results,
                nextStep:
                    mode === 'verify'
                        ? 'Verification publishes no prices or previews and runs no generation. Continue nextOffset until null; actualize separately when updates are wanted.'
                        : 'Apply intended previews with admin_apply and stable operation keys before continuing nextOffset. Price publication does not activate models or satisfy runtime checks.',
            };
            await this.deps.audit.recordRead(
                fresh,
                operation,
                input,
                value,
                input.reason,
            );
            return value;
        } catch (error) {
            await this.deps.audit.recordRejected(actor, operation, raw, error);
            throw error;
        }
    }
    private authorize(actor: AdminMcpActor, mode: 'verify' | 'actualize') {
        if (mode === 'verify') {
            requirePermission(actor, 'providers.read');
            requireAction(actor, 'provider-prices.verify');
        } else {
            requirePermission(actor, 'provider-prices.write');
            requireAction(actor, 'provider-prices.actualize-native.v1');
            requireAction(actor, 'provider-prices.native-write');
        }
    }
    private async fetch(targets: ProviderPriceTarget[], signal: AbortSignal) {
        const sources = new Map(
            this.deps.sources.map((source) => [source.providerId, source]),
        );
        const fetched: ProviderPriceFetchResult[] = [];
        for (const providerId of new Set(
            targets.map((target) => target.providerId),
        )) {
            signal.throwIfAborted();
            const batch = targets.filter(
                (target) => target.providerId === providerId,
            );
            const source = sources.get(providerId);
            if (!source) {
                fetched.push(
                    ...batch.map((target): ProviderPriceFetchResult => ({
                        target,
                        status: 'unsupported',
                        reason: 'A new provider requires a reviewed price source adapter.',
                    })),
                );
                continue;
            }
            try {
                const values = await source.fetchPrices(batch, signal);
                for (const target of batch) {
                    const matching = values.filter(
                        (value) =>
                            priceTargetKey(value.target) ===
                            priceTargetKey(target),
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
                signal.throwIfAborted();
                fetched.push(
                    ...batch.map((target): ProviderPriceFetchResult => ({
                        target,
                        status: 'unavailable',
                        reason: 'Official pricing could not be fetched or validated.',
                    })),
                );
            }
        }
        return fetched;
    }
}
