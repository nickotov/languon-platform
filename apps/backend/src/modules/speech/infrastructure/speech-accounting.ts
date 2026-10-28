import { and, eq, sql } from 'drizzle-orm';
import type { SpeechProfile } from '../application/ports';
import { SpeechError } from '../domain/speech-policy';
import type { AiCreditTransaction } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleCapabilityPolicyParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { pinProviderPrice } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { providerSpeechExpenseMicros } from '../../ai-credits/domain/provider-expense';
import { evaluateNativeProviderCost } from '../../ai-credits/domain/native-provider-pricing';
import { findSpeechModel } from '../domain/speech-models';
import {
    DrizzleOperatorBudgetParticipant,
    OperatorBudgetUnavailableError,
} from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { speechDailyAdmissionCountersTable as counters } from './schema';
import type { speechJobsTable } from './schema';

type Job = typeof speechJobsTable.$inferSelect;

export async function authorizeSpeechAccounting(
    tx: AiCreditTransaction,
    input: {
        jobId: string;
        ownerId: string;
        profile: SpeechProfile;
        characters: number;
        at: Date;
    },
) {
    const nativeBilling =
        input.profile.nativeBilling ??
        findSpeechModel(input.profile.provider, input.profile.model)
            ?.nativeBilling;
    // A model serving limit is useful evidence, but not a broker's task cost cap.
    if (nativeBilling && !nativeBilling.providerTaskBoundVerified)
        throw new SpeechError('speech_provider_unavailable', 503);
    const price = await pinProviderPrice(tx, {
        providerId: input.profile.provider,
        modelId: input.profile.model,
        meter: nativeBilling?.meter ?? 'speech-characters',
        at: input.at,
    });
    const nativeMaximum = price?.nativeRules
        ? evaluateNativeProviderCost(
              price.nativeRules,
              {
                  dispatchedAt: input.at.toISOString(),
                  latestDispatchAt: new Date(
                      input.at.getTime() + 120_000,
                  ).toISOString(),
              },
              {
                  ...(nativeBilling?.usageBounds ?? {}),
                  characters: input.characters,
                  requests: 1,
              },
              'upper-bound',
          )
        : null;
    const maximum = nativeMaximum
        ? nativeMaximum.status === 'calculated'
            ? nativeMaximum.micros
            : null
        : providerSpeechExpenseMicros(price, input.characters);
    if (!price || maximum === null)
        throw new SpeechError('speech_provider_unavailable', 503);
    const settings = await new DrizzleCapabilityPolicyParticipant(
        tx,
    ).settings();
    if (
        !settings.maxProviderCostUsdPerAction ||
        !settings.maxProviderCostUsdPerAccountDay ||
        !settings.maxProviderCostUsdPerDay
    )
        throw new SpeechError('speech_provider_unavailable', 503);
    const authorization = await new DrizzleOperatorBudgetParticipant(tx)
        .reserveAction({
            actionId: input.jobId,
            ownerId: input.ownerId,
            maximumMicros: maximum,
            settings,
            at: input.at,
        })
        .catch((error: unknown) => {
            if (error instanceof OperatorBudgetUnavailableError)
                throw new SpeechError('speech_provider_budget', 429);
            throw error;
        });
    // Speech is an indivisible provider operation: a partially authorized clip must never dispatch.
    if (authorization.reservedMicros < maximum)
        throw new SpeechError('speech_provider_budget', 429);
    // Numerical execution provenance needs no administrator identity, free-text reason or source URL.
    return {
        id: price.id,
        version: price.version,
        providerId: price.providerId,
        modelId: price.modelId,
        meter: price.meter,
        usdPer1000Characters: price.usdPer1000Characters,
        ...(price.minimumUsdPerRequest == null
            ? {}
            : { minimumUsdPerRequest: price.minimumUsdPerRequest }),
        effectiveAt: price.effectiveAt,
        ...(price.nativeRules ? { nativeRules: price.nativeRules } : {}),
    };
}

export async function reserveSpeechProviderAttempt(
    tx: AiCreditTransaction,
    job: Job,
    _at: Date,
) {
    if (job.accountingVersion !== 1 || job.providerDispatchedAt) return;
    await tx.execute(
        sql`select languon_admit_speech_provider_attempt(${job.id}::uuid,${job.leaseToken}::uuid)`,
    );
}

/** A checked numerical seam validates every replay against the persisted first observation. */
export async function settleSpeechProviderExpense(
    tx: AiCreditTransaction,
    job: Job,
    outcome: 'ready' | 'unknown' | 'not_submitted',
    _at: Date,
) {
    if (job.accountingVersion !== 1) return;
    await tx.execute(
        sql`select languon_record_speech_provider_expense(${job.id}::uuid, ${job.providerOutcome ?? outcome})`,
    );
}

export async function reserveSpeechAdmissionQuota(
    tx: AiCreditTransaction,
    input: {
        ownerId: string;
        at: Date;
        free: boolean;
        units: number;
        freeLimit: number;
        ownerUnitLimit: number;
        globalUnitLimit: number;
    },
) {
    const day = input.at.toISOString().slice(0, 10);
    for (const scope of ['global', `owner:${input.ownerId}`]) {
        await tx.insert(counters).values({ day, scope }).onConflictDoNothing();
        const [current] = await tx
            .select()
            .from(counters)
            .where(and(eq(counters.day, day), eq(counters.scope, scope)))
            .for('update');
        const units = current!.estimatedUnits + BigInt(input.units);
        if (
            units >
            BigInt(
                scope === 'global'
                    ? input.globalUnitLimit
                    : input.ownerUnitLimit,
            )
        )
            throw new SpeechError('speech_provider_budget', 429);
        const freeCount = current!.freeCount + (input.free ? 1 : 0);
        if (scope !== 'global' && freeCount > input.freeLimit)
            throw new SpeechError('speech_free_daily_limit', 429);
        await tx
            .update(counters)
            .set({ freeCount, estimatedUnits: units })
            .where(and(eq(counters.day, day), eq(counters.scope, scope)));
    }
    // Old day rows are never queried by admission; the worker removes them in bounded batches.
}

export async function lockSpeechWalletOwner(
    tx: AiCreditTransaction,
    ownerId: string | null,
) {
    if (ownerId)
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${ownerId},1920424381))`,
        );
}
