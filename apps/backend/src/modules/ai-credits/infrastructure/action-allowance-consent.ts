import { OperatorBudgetUnavailableError } from './persistence/drizzle/drizzle-operator-budget-participant';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context, MiddlewareHandler } from 'hono';
import type { ActionAllowanceQuote } from '@languon/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from '@languon/database';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import type { AiCreditTransaction } from './persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleAiCreditTransactionParticipant } from './persistence/drizzle/drizzle-ai-credit-participant';
import { aiCreditActionQuotesTable as quotes } from './persistence/drizzle/action-accounting-schema';
import {
    affordableActionOutput,
    type ActionTariff,
} from '../domain/action-pricing';
import { formatCreditMilli } from '../domain/exact-credit-amount';
import { AiCreditInsufficientBalanceError } from '../domain/ai-credit';
import { providerAffordableOutputTokens } from '../domain/provider-cost-admission';
import type { TextAiProviderBudgetPolicy } from '../../text-ai/application/text-ai-provider-catalog';
const consent = new AsyncLocalStorage<{ confirmedQuoteId?: string }>();
export function withActionAllowanceConsent<T>(
    confirmedQuoteId: string | undefined,
    work: () => T,
): T {
    return consent.run(confirmedQuoteId ? { confirmedQuoteId } : {}, work);
}
/** Confirmation is transport metadata: domain fingerprints remain those of the original request. */
export const actionAllowanceRequestMiddleware: MiddlewareHandler = async (
    c,
    next,
) => {
    if (
        c.req.method !== 'POST' ||
        !c.req.header('Content-Type')?.includes('application/json')
    )
        return next();
    // Mounted modules can run another streaming body guard after this middleware.
    // Inspect a clone so that guard can still read the original request stream.
    const body: unknown = await c.req.raw
        .clone()
        .json()
        .catch(() => null);
    if (!body || typeof body !== 'object' || !('confirmedQuoteId' in body))
        return next();
    const parsed = z.uuid().safeParse(body.confirmedQuoteId);
    if (!parsed.success)
        return c.json(
            {
                error: {
                    code: 'invalid_request',
                    message: 'Invalid action confirmation.',
                    correlationId: randomUUID(),
                },
            },
            400,
        );
    delete (body as Record<string, unknown>).confirmedQuoteId;
    // Hono reparses cached text for each json() read; replace that public cache too.
    // Hono4.13 stores Promises here although its public declaration exposes resolved Body values.
    (c.req.bodyCache as unknown as { text: Promise<string> }).text =
        Promise.resolve(JSON.stringify(body));
    return withActionAllowanceConsent(parsed.data, next);
};
type QuoteDraft = typeof quotes.$inferInsert;
export class ActionAllowanceConfirmationRequired extends Error {
    readonly code = 'action_confirmation_required';
    constructor(public readonly draft: QuoteDraft) {
        super('Confirm the available output allowance before sending.');
    }
    get quote(): ActionAllowanceQuote {
        return {
            id: this.draft.id,
            maximumCredits: formatCreditMilli(this.draft.heldMilli),
            approximateOutputTokens: this.draft.outputAllowance,
            expiresAt: this.draft.expiresAt.toISOString(),
        };
    }
}
export class ActionAllowanceRequestConflict extends Error {}
export function actionAllowanceErrorResponse(error: unknown, c: Context) {
    if (error instanceof ActionAllowanceRequestConflict)
        return c.json(
            {
                error: {
                    code: 'idempotency_conflict',
                    message:
                        'This request identifier was already used for another action.',
                    correlationId: randomUUID(),
                },
            },
            409,
        );
    if (!(error instanceof ActionAllowanceConfirmationRequired))
        return undefined;
    return c.json(
        {
            error: {
                code: error.code,
                message: error.message,
                details: { quote: error.quote },
                correlationId: randomUUID(),
            },
        },
        409,
    );
}
/** The failed feature transaction is rolled back; only the non-spending offer is then retained. */
export async function withActionQuotePersistence<T>(
    database: PostgresJsDatabase<typeof databaseSchema>,
    work: () => Promise<T>,
): Promise<T> {
    try {
        return await work();
    } catch (error) {
        if (error instanceof ActionAllowanceConfirmationRequired) {
            const persisted = await database.transaction(async (tx) => {
                const [inserted] = await tx
                    .insert(quotes)
                    .values(error.draft)
                    .onConflictDoNothing()
                    .returning();
                if (inserted) return inserted;
                const [existing] = await tx
                    .select()
                    .from(quotes)
                    .where(
                        and(
                            eq(quotes.ownerId, error.draft.ownerId),
                            eq(
                                quotes.conversationId,
                                error.draft.conversationId,
                            ),
                            eq(quotes.requestId, error.draft.requestId),
                        ),
                    )
                    .for('update');
                if (
                    !existing ||
                    existing.fingerprint !== error.draft.fingerprint
                )
                    throw new ActionAllowanceRequestConflict(
                        'Conflicting action allowance request identity.',
                    );
                const issuedAt = new Date(
                    error.draft.expiresAt.getTime() - 5 * 60_000,
                );
                if (
                    existing.authorizationFingerprint ===
                        error.draft.authorizationFingerprint &&
                    existing.heldMilli === error.draft.heldMilli &&
                    existing.outputAllowance === error.draft.outputAllowance &&
                    existing.expiresAt > issuedAt
                )
                    return existing;
                const [updated] = await tx
                    .update(quotes)
                    .set(error.draft)
                    .where(eq(quotes.id, existing.id))
                    .returning();
                if (!updated)
                    throw new Error('Action allowance offer was not retained.');
                return updated;
            });
            Object.assign(error.draft, persisted);
        }
        throw error;
    }
}
const hash = (value: unknown) =>
    createHash('sha256')
        .update(
            JSON.stringify(value, (_key, item: unknown) =>
                typeof item === 'bigint' ? item.toString() : item,
            ),
        )
        .digest('hex');
const uuid = (value: unknown) => {
    const digest = hash(value);
    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
};
export async function authorizeActionAllowance(
    tx: AiCreditTransaction,
    input: {
        ownerId: string;
        scope: string;
        requestKey: string;
        fingerprint: string;
        authorization: unknown;
        funding: 'customer' | 'operator' | 'unlimited';
        tariff: ActionTariff;
        budgetMilli: bigint;
        maximumMilli: bigint;
        inputTokens: number;
        outputLimit: number;
        providerBudget: TextAiProviderBudgetPolicy;
        at: Date;
    },
) {
    const requested = Math.min(10000, input.outputLimit);
    if (
        input.funding !== 'customer' ||
        Object.values(input.tariff).every((rate) => Number(rate) === 0)
    )
        return { holdMaximumMilli: input.maximumMilli, outputLimit: requested };
    await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.ownerId},1920424381))`,
    );
    const account = await new DrizzleAiCreditTransactionParticipant(
        tx,
    ).accountSummary(input.ownerId, input.at);
    const maximum =
        input.maximumMilli < input.budgetMilli
            ? input.maximumMilli
            : input.budgetMilli;
    const held =
        maximum < account.availableCredits ? maximum : account.availableCredits;
    if (
        (input.providerBudget.minimumCostMicrosPerRequest ?? 0) >
        input.providerBudget.maxCostMicrosPerAttempt
    )
        throw new OperatorBudgetUnavailableError(
            'Provider request minimum exceeds operator allowance.',
        );
    const allowance = providerAffordableOutputTokens({
        inputTokens: input.inputTokens,
        outputLimit: affordableActionOutput({
            budgetMilli: held,
            inputTokens: input.inputTokens,
            outputLimit: requested,
            tariff: input.tariff,
        }),
        budget: input.providerBudget,
    });
    if (allowance < 1) throw new AiCreditInsufficientBalanceError();
    const conversationId = uuid(['action-allowance', input.scope]);
    const requestId = uuid(input.requestKey);
    const authorizationFingerprint = hash(input.authorization);
    const [offered] = await tx
        .select()
        .from(quotes)
        .where(
            and(
                eq(quotes.ownerId, input.ownerId),
                eq(quotes.conversationId, conversationId),
                eq(quotes.requestId, requestId),
            ),
        )
        .for('update');
    if (offered && offered.fingerprint !== input.fingerprint)
        throw new ActionAllowanceRequestConflict(
            'Conflicting action allowance request identity.',
        );
    const confirmedId = consent.getStore()?.confirmedQuoteId;
    const valid =
        offered &&
        offered.id === confirmedId &&
        offered.authorizationFingerprint === authorizationFingerprint &&
        offered.expiresAt > input.at &&
        offered.heldMilli <= held &&
        offered.outputAllowance <= allowance;
    if (valid)
        return {
            holdMaximumMilli: offered.heldMilli,
            outputLimit: offered.outputAllowance,
        };
    if (allowance < requested || held < maximum || confirmedId || offered) {
        const reusable =
            offered &&
            offered.authorizationFingerprint === authorizationFingerprint &&
            offered.expiresAt > input.at &&
            offered.heldMilli <= held &&
            offered.outputAllowance <= allowance;
        throw new ActionAllowanceConfirmationRequired(
            reusable && !confirmedId
                ? offered
                : {
                      id: randomUUID(),
                      ownerId: input.ownerId,
                      conversationId,
                      requestId,
                      fingerprint: input.fingerprint,
                      authorizationFingerprint,
                      heldMilli: held,
                      outputAllowance: allowance,
                      expiresAt: new Date(input.at.getTime() + 5 * 60_000),
                  },
        );
    }
    return { holdMaximumMilli: held, outputLimit: allowance };
}
