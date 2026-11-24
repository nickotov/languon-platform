import { learningContentActionOutputLimit } from '../application/learning-content-batches';
import { prepareAdminTextAiRouting } from '../../text-ai/infrastructure/persistence/drizzle/routing-admission';
import { defaultTextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import {
    reviewedTextProviderBudget,
    ProviderCostAdmissionUnavailableError,
    providerAffordableOutputTokens,
} from '../../ai-credits/domain/provider-cost-admission';
import { parseFixed } from '../../ai-credits/domain/accounting';
import { OperatorBudgetUnavailableError } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { DrizzleActionAccountingParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleCapabilityPolicyParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { pinProviderPrice } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import {
    maximumActionChargeNumerator,
    roundActionChargeMilli,
    affordableActionOutput,
} from '../../ai-credits/domain/action-pricing';
import { aiCreditActionQuotesTable as quotes } from '../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import {
    formatCreditMilli,
    parseCreditMilli,
} from '../../ai-credits/domain/exact-credit-amount';
import { textAiPreferencesTable } from '../../text-ai/infrastructure/persistence/drizzle/schema';
import { createHash, randomUUID } from 'node:crypto';
import {
    createConversationActionAccounting,
    usesActionAccounting,
} from './conversation-action-accounting';
import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../infrastructure/text-ai/text-ai-capacity';
import { DrizzleAiCreditTransactionParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleTextAiAdmissionParticipant } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import {
    defaultTextAiProviderBudgetPolicy,
    textAiProviderUsageCostMicros,
} from '../../text-ai/application/text-ai-provider-catalog';
import {
    TextAiSelectionUnavailableError,
    type TextAiAdmissionExecution,
} from '../../text-ai/application/text-ai-admission-participant';
import type { TextAiAvailabilityPolicy } from '../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import type { TutorAccountingPort } from '../application/ports/tutor-runner';
import type { conversationTurnsTable as turns } from './persistence/drizzle/schema';
import { ConversationError } from '../domain/conversation';
import { generationFingerprint } from '../application/generation-run-revisions';
import type { GenerationAutomaticAdmission } from '../application/ports/generation-run';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export function conversationAdmission(policy?: TextAiAvailabilityPolicy) {
    const availability = policy ?? defaultTextAiAvailabilityPolicy();
    const admit = async (
        tx: Transaction,
        input: {
            ownerId: string;
            turnId: string;
            conversationId: string;
            requestId?: string;
            fingerprint?: string;
            confirmedQuoteId?: string;
            forceConfirmation?: boolean;
            mayGenerateLesson?: boolean;
            includeListeningSpeech?: boolean;
            minimumOutputTokens?: number;
            inputTokenBound?: number;
            minimumInputBound: number;
            reserveToolContinuation?: boolean;
            generationAuthorization?: GenerationAutomaticAdmission;
            recordingPlanAuthorization?: GenerationAutomaticAdmission;
            renewRecording?: boolean;
        },
    ): Promise<Record<string, unknown>> => {
        await lockTextAiCapacity(tx);
        const now = new Date();
        const execution = await new DrizzleTextAiAdmissionParticipant(
            tx,
            availability,
        )
            .resolve({
                userId: input.ownerId,
                format: 'conversation:v1',
                now,
                legacyBudget: defaultTextAiProviderBudgetPolicy,
            })
            .catch((error: unknown) => {
                if (error instanceof TextAiSelectionUnavailableError) {
                    throw new ConversationError(
                        'model_unavailable',
                        'AI is unavailable right now. Your messages are kept. Try again later.',
                    );
                }

                throw error;
            });

        if (
            !execution.snapshot?.creditPricing ||
            !execution.snapshot.supportedFormats.includes('conversation:v1')
        ) {
            throw new ConversationError(
                'model_unavailable',
                'AI is unavailable right now. Your messages are kept. Try again later.',
            );
        }

        const account = await new DrizzleAiCreditTransactionParticipant(
            tx,
        ).accountSummary(input.ownerId, now);
        const capability = new DrizzleCapabilityPolicyParticipant(tx);
        const charging = await capability.current('conversation');
        if (
            charging.funding !== 'operator' &&
            execution.snapshot.routingAuthority?.tariffPublished === false
        ) {
            throw new ConversationError(
                'model_unavailable',
                'AI is not configured for this action. Try again later.',
            );
        }

        const funding =
            charging.funding === 'operator'
                ? 'operator'
                : account.policy.effectiveMode === 'unlimited'
                  ? 'unlimited'
                  : 'customer';
        const [preference] = await tx
            .select({
                maxCreditsPerAction: textAiPreferencesTable.maxCreditsPerAction,
            })
            .from(textAiPreferencesTable)
            .where(eq(textAiPreferencesTable.userId, input.ownerId));
        const settings = await capability.settings();
        const defaultBudget = settings.defaultMaxCreditsPerAction;
        const budget = preference?.maxCreditsPerAction ?? defaultBudget;
        const zeroCustomerTariff = [
            execution.snapshot.creditPricing.inputCreditsPerMillionTokens,
            execution.snapshot.creditPricing.outputCreditsPerMillionTokens,
            execution.snapshot.creditPricing
                .cachedInputCreditsPerMillionTokens ??
                execution.snapshot.creditPricing.inputCreditsPerMillionTokens,
        ].every((rate) => rate === 0);

        if (funding === 'customer' && !budget && !zeroCustomerTariff) {
            throw new ConversationError(
                'action_budget_unconfigured',
                'An AI action budget must be configured before sending.',
            );
        }

        const pinnedCandidate =
            execution.snapshot.routingAuthority?.candidates.find(
                (candidate) =>
                    candidate.snapshot.providerId ===
                        execution.snapshot.providerId &&
                    candidate.snapshot.modelId === execution.snapshot.modelId,
            );
        const providerPrice =
            pinnedCandidate?.providerPrice ??
            (await pinProviderPrice(tx, {
                providerId: execution.snapshot.providerId,
                modelId: execution.snapshot.modelId,
                meter: 'text-tokens',
                at: now,
            }));

        try {
            execution.budget = reviewedTextProviderBudget(
                providerPrice,
                execution.budget,
                { read: 'input-price-upper-bound', write: 'none' },
            );

            if (
                !settings.maxProviderCostUsdPerAction ||
                !settings.maxProviderCostUsdPerAccountDay ||
                !settings.maxProviderCostUsdPerDay
            ) {
                throw new OperatorBudgetUnavailableError(
                    'Operator spending limits must be configured.',
                );
            }

            const operatorMaximum = parseFixed(
                settings.maxProviderCostUsdPerAction,
                6,
            );

            execution.budget.maxCostMicrosPerAttempt = Math.min(
                execution.budget.maxCostMicrosPerAttempt,
                Number(operatorMaximum),
            );
        } catch (error) {
            if (
                error instanceof ProviderCostAdmissionUnavailableError ||
                error instanceof OperatorBudgetUnavailableError
            ) {
                throw new ConversationError(
                    'model_unavailable',
                    'Reviewed provider pricing and operator spending limits must be configured before generation is enabled.',
                );
            }

            throw error;
        }

        if (
            !Number.isSafeInteger(input.inputTokenBound) ||
            (input.inputTokenBound ?? 0) < 1
        ) {
            throw new ConversationError(
                'context_too_large',
                'A bounded conversation context is required for admission.',
            );
        }

        const tariff = {
            ...(execution.snapshot.creditPricing
                .cachedInputCreditsPerMillionTokens != null
                ? {
                      cachedInputCreditsPerMillionTokens: String(
                          execution.snapshot.creditPricing
                              .cachedInputCreditsPerMillionTokens,
                      ),
                  }
                : {}),
            inputCreditsPerMillionTokens: String(
                execution.snapshot.creditPricing.inputCreditsPerMillionTokens,
            ),
            outputCreditsPerMillionTokens: String(
                execution.snapshot.creditPricing.outputCreditsPerMillionTokens,
            ),
        };
        const generationAuthorizationFingerprint = generationFingerprint({
            snapshot: execution.snapshot,
            charging,
            funding,
            providerPrice,
            settings,
            customerBudget: budget,
        });
        const automatic = input.generationAuthorization;
        const plannedRecording = input.recordingPlanAuthorization;
        const prior = plannedRecording ?? automatic;
        const stageDeadline = now.getTime() + 15 * 60_000;
        const deadline = prior
            ? Math.min(Date.parse(prior.expiresAt), stageDeadline)
            : stageDeadline;

        if (
            prior &&
            prior.authorizationFingerprint !==
                generationAuthorizationFingerprint
        ) {
            throw new ConversationError(
                'model_unavailable',
                'Generation settings changed. Review a fresh allowance before continuing.',
            );
        }

        if (
            prior &&
            (!Number.isFinite(deadline) ||
                deadline <= Date.now() ||
                !Number.isSafeInteger(prior.maximumProviderCostMicros) ||
                prior.maximumProviderCostMicros < 1)
        ) {
            throw new ConversationError(
                'generation_scope_change',
                'The original lesson allowance has expired, changed or been exhausted.',
            );
        }

        // Split only what remains after planning. The text stage and synthesized
        // utterances must fit inside the same original provider limit and deadline.
        if (prior) {
            execution.budget.maxCostMicrosPerAttempt = Math.min(
                execution.budget.maxCostMicrosPerAttempt,
                prior.maximumProviderCostMicros,
            );
        }

        const combined = input.includeListeningSpeech === true && !automatic;
        const speechMaximumProviderMicros = combined
            ? Math.floor(execution.budget.maxCostMicrosPerAttempt / 2)
            : 0;

        if (combined && speechMaximumProviderMicros < 1) {
            throw new ConversationError(
                'generation_scope_change',
                'The lesson has no remaining recording allowance.',
            );
        }

        execution.budget.maxCostMicrosPerAttempt -= speechMaximumProviderMicros;
        const generationMaximumProviderCostMicros =
            execution.budget.maxCostMicrosPerAttempt;
        const textCustomerPays = funding === 'customer' && !zeroCustomerTariff;
        const configuredBudgetMilli = budget ? parseCreditMilli(budget) : 0n;
        // An operator-funded planner has no customer allowance. Any new paid
        // speech in that case needs its own explicit combined quote below.
        const recordingConsent =
            plannedRecording?.recordingConsent?.remainingCreditsMilli;
        const remainingCredits =
            recordingConsent !== undefined
                ? BigInt(recordingConsent)
                : prior && (automatic || textCustomerPays)
                  ? BigInt(prior.maximumCreditsMilli)
                  : configuredBudgetMilli;
        const totalAuthorizedBudgetMilli =
            configuredBudgetMilli < remainingCredits
                ? configuredBudgetMilli
                : remainingCredits;

        const speechPolicy = combined
            ? await capability.current('speech')
            : null;
        const speechCustomerPays =
            !!speechPolicy &&
            speechPolicy.funding !== 'operator' &&
            account.policy.effectiveMode !== 'unlimited';
        const availableCombined =
            (textCustomerPays || speechCustomerPays) &&
            account.availableCredits < totalAuthorizedBudgetMilli
                ? account.availableCredits
                : totalAuthorizedBudgetMilli;
        const speechMaximumMilli = speechCustomerPays
            ? textCustomerPays
                ? availableCombined / 2n
                : availableCombined
            : 0n;

        if (speechCustomerPays && speechMaximumMilli === 0n) {
            throw new ConversationError(
                budget ? 'credits_exhausted' : 'action_budget_unconfigured',
                'A positive speech allowance is required to prepare a new recording.',
            );
        }

        const authorizedBudgetMilli =
            combined && textCustomerPays
                ? availableCombined - speechMaximumMilli
                : totalAuthorizedBudgetMilli;

        let admittedMaxInputTokens = Math.min(
            execution.snapshot.perCallMaxInputTokens,
            input.inputTokenBound!,
        );

        if (input.reserveToolContinuation) {
            const customerBudget =
                authorizedBudgetMilli < account.availableCredits
                    ? authorizedBudgetMilli
                    : account.availableCredits;
            const affordableOutput = (inputTokens: number) => {
                const providerOutput = providerAffordableOutputTokens({
                    inputTokens,
                    outputLimit: learningContentActionOutputLimit,
                    budget: execution.budget,
                });

                if (funding !== 'customer' || zeroCustomerTariff) {
                    return providerOutput;
                }

                return Math.min(
                    providerOutput,
                    affordableActionOutput({
                        budgetMilli: customerBudget,
                        inputTokens,
                        outputLimit: learningContentActionOutputLimit,
                        tariff,
                    }),
                );
            };
            // Tool arguments join the next prompt. Reserve prospective headroom
            // without reducing the initial output allowance or exceeding funds.
            // All pricing, holds and the immutable snapshot are finalized below.
            const initialOutput = affordableOutput(admittedMaxInputTokens);
            let ceiling = Math.min(
                execution.snapshot.perCallMaxInputTokens,
                execution.budget.maxInputTokensPerAttempt,
            );

            while (initialOutput > 0 && admittedMaxInputTokens < ceiling) {
                const candidate = Math.ceil(
                    (admittedMaxInputTokens + ceiling) / 2,
                );

                if (affordableOutput(candidate) >= initialOutput) {
                    admittedMaxInputTokens = candidate;
                } else {
                    ceiling = candidate - 1;
                }
            }
        }

        if (
            !Number.isSafeInteger(input.minimumInputBound) ||
            input.minimumInputBound < 1 ||
            input.minimumInputBound > admittedMaxInputTokens
        ) {
            throw new ConversationError(
                'context_too_large',
                'The complete current document and references exceed the admitted input allowance.',
            );
        }

        const totalInputLimit = Math.min(
            execution.budget.maxInputTokensPerAttempt,
            admittedMaxInputTokens * 5,
        );

        execution.budget.maxCostMicrosPerAttempt = Math.min(
            execution.budget.maxCostMicrosPerAttempt,
            textAiProviderUsageCostMicros(execution.budget, {
                inputTokens: totalInputLimit,
                outputTokens: learningContentActionOutputLimit,
            }) +
                (execution.budget.inputCostMicrosPerMillionTokens > 0 ? 4 : 0) +
                (execution.budget.outputCostMicrosPerMillionTokens > 0 ? 4 : 0),
        );

        if (
            providerAffordableOutputTokens({
                inputTokens: admittedMaxInputTokens,
                outputLimit: learningContentActionOutputLimit,
                budget: execution.budget,
            }) < 1
        ) {
            throw new ConversationError(
                'capacity_unavailable',
                'The AI request exceeds the available execution allowance. Try again later.',
            );
        }

        // The worker and financial action cap a whole stage at 10,000 output
        // tokens. Keep the immutable cohort (and its daily limits) separate
        // from this prospective stage, including when returning a quote.
        const capacity = await readTextAiCapacity(tx, {
            actorId: input.ownerId,
            now,
            budget: execution.budget,
        });

        if (capacity.globalQueued >= 100 || capacity.actorQueued >= 5) {
            throw new ConversationError(
                'capacity_unavailable',
                'The generation queue is currently full. Try again shortly.',
            );
        }

        if (
            !textAiProviderBudgetAllows(
                capacity.providerUsage,
                {
                    costMicros: execution.budget.maxCostMicrosPerAttempt,
                    inputTokens: totalInputLimit,
                    outputTokens: Math.min(
                        learningContentActionOutputLimit,
                        execution.budget.maxOutputTokensPerAttempt,
                    ),
                },
                execution.budget,
            )
        ) {
            throw new ConversationError(
                'provider_capacity_exhausted',
                'The remaining provider capacity cannot cover this stage.',
            );
        }

        const plannedMaximumMilli = roundActionChargeMilli(
            maximumActionChargeNumerator(
                {
                    inputTokens: totalInputLimit,
                    outputTokens: learningContentActionOutputLimit,
                },
                tariff,
            ),
        );
        let acceptedBudgetMilli =
            authorizedBudgetMilli < plannedMaximumMilli
                ? authorizedBudgetMilli
                : plannedMaximumMilli;

        const customerPays = textCustomerPays;
        const wholeLessonQuote = input.mayGenerateLesson && !automatic;
        let generationMaximumCreditsMilli = authorizedBudgetMilli;
        let recordingConsentMilli: string | undefined;
        if (customerPays || combined || input.forceConfirmation || automatic) {
            const available = account.availableCredits;
            const held = !customerPays
                ? 0n
                : acceptedBudgetMilli < available
                  ? acceptedBudgetMilli
                  : available;

            if (customerPays && available < generationMaximumCreditsMilli) {
                generationMaximumCreditsMilli = available;
            }

            const quoteMaximum = combined
                ? (customerPays ? authorizedBudgetMilli : 0n) +
                  speechMaximumMilli
                : customerPays && wholeLessonQuote
                  ? generationMaximumCreditsMilli
                  : held;
            const quoteScope = combined
                ? { scope: 'listening-lesson' as const }
                : wholeLessonQuote
                  ? { scope: 'lesson-if-planned' as const }
                  : {};
            const customerAllowance = customerPays
                ? affordableActionOutput({
                      budgetMilli: held,
                      inputTokens: admittedMaxInputTokens,
                      outputLimit: learningContentActionOutputLimit,
                      tariff,
                  })
                : learningContentActionOutputLimit;

            if (customerAllowance < 1) {
                throw new ConversationError(
                    'credits_exhausted',
                    'You do not have enough AI credits for input and any output.',
                );
            }

            const allowance = providerAffordableOutputTokens({
                inputTokens: admittedMaxInputTokens,
                outputLimit: customerAllowance,
                budget: execution.budget,
            });

            if (allowance < 1) {
                throw new ConversationError(
                    'credits_exhausted',
                    'You do not have enough AI credits for input and any output.',
                );
            }

            if (allowance < (input.minimumOutputTokens ?? 0)) {
                throw new ConversationError(
                    'generation_scope_change',
                    'The available allowance cannot complete the next lesson section. Increase the available budget or revise the plan.',
                );
            }

            const authorizationFingerprint = createHash('sha256')
                .update(
                    JSON.stringify({
                        execution,
                        charging,
                        budget,
                        providerPrice,
                        ...quoteScope,
                        ...(input.renewRecording
                            ? { freshRecordingAllowance: true }
                            : {}),
                        ...(wholeLessonQuote && !combined
                            ? { optionalRecording: 1 }
                            : {}),
                        ...(combined
                            ? {
                                  speechPolicy,
                                  speechMaximumMilli:
                                      speechMaximumMilli.toString(),
                                  speechMaximumProviderMicros,
                              }
                            : {}),
                    }),
                )
                .digest('hex');
            const [offered] = input.requestId
                ? await tx
                      .select()
                      .from(quotes)
                      .where(
                          and(
                              eq(quotes.ownerId, input.ownerId),
                              eq(quotes.conversationId, input.conversationId),
                              eq(quotes.requestId, input.requestId),
                          ),
                      )
                      .for('update')
                : [];

            if (offered && offered.fingerprint !== input.fingerprint) {
                throw new ConversationError(
                    'idempotency_conflict',
                    'This request identifier has already been used for another message.',
                );
            }

            if (
                offered &&
                (!input.confirmedQuoteId ||
                    (input.renewRecording &&
                        input.confirmedQuoteId !== offered.id)) &&
                offered.authorizationFingerprint === authorizationFingerprint &&
                offered.expiresAt > now &&
                offered.heldMilli <= quoteMaximum &&
                offered.outputAllowance <= allowance &&
                offered.outputAllowance >= (input.minimumOutputTokens ?? 0)
            ) {
                return {
                    confirmationRequired: true,
                    quote: {
                        ...quoteScope,
                        id: offered.id,
                        maximumCredits: formatCreditMilli(offered.heldMilli),
                        approximateOutputTokens: offered.outputAllowance,
                        expiresAt: offered.expiresAt.toISOString(),
                    },
                };
            }

            const [confirmed] = input.confirmedQuoteId
                ? await tx
                      .select()
                      .from(quotes)
                      .where(eq(quotes.id, input.confirmedQuoteId))
                      .for('update')
                : [];
            const validQuote =
                confirmed &&
                confirmed.ownerId === input.ownerId &&
                confirmed.conversationId === input.conversationId &&
                confirmed.requestId === input.requestId &&
                confirmed.fingerprint === input.fingerprint &&
                confirmed.authorizationFingerprint ===
                    authorizationFingerprint &&
                confirmed.expiresAt > now &&
                confirmed.heldMilli <= quoteMaximum &&
                confirmed.outputAllowance <= allowance &&
                confirmed.outputAllowance >= (input.minimumOutputTokens ?? 0);

            // An accepted lesson-wide quote is valid for a bounded reallocation from
            // the original action, even if the remaining wallet/output is smaller.
            const needsConfirmation = plannedRecording
                ? speechCustomerPays && recordingConsent === undefined
                : input.renewRecording ||
                  input.forceConfirmation ||
                  (combined &&
                      availableCombined < totalAuthorizedBudgetMilli) ||
                  allowance < learningContentActionOutputLimit ||
                  (customerPays && held < acceptedBudgetMilli);

            if (
                !automatic &&
                (needsConfirmation || input.confirmedQuoteId) &&
                !validQuote
            ) {
                if (!input.requestId || !input.fingerprint) {
                    throw new ConversationError(
                        'action_confirmation_required',
                        'Confirm the available output allowance before sending.',
                    );
                }

                const quote = {
                    id: randomUUID(),
                    ownerId: input.ownerId,
                    conversationId: input.conversationId,
                    requestId: input.requestId,
                    fingerprint: input.fingerprint,
                    authorizationFingerprint,
                    heldMilli: quoteMaximum,
                    outputAllowance: allowance,
                    expiresAt: new Date(
                        Math.min(deadline, now.getTime() + 5 * 60_000),
                    ),
                };

                await tx
                    .insert(quotes)
                    .values(quote)
                    .onConflictDoUpdate({
                        target: [
                            quotes.ownerId,
                            quotes.conversationId,
                            quotes.requestId,
                        ],
                        set: quote,
                    });

                return {
                    confirmationRequired: true,
                    quote: {
                        ...quoteScope,
                        id: quote.id,
                        maximumCredits: formatCreditMilli(quoteMaximum),
                        approximateOutputTokens: allowance,
                        expiresAt: quote.expiresAt.toISOString(),
                    },
                };
            }

            if (validQuote) {
                if (wholeLessonQuote && !combined && confirmed.heldMilli > 0n) {
                    recordingConsentMilli = confirmed.heldMilli.toString();
                }

                generationMaximumCreditsMilli = customerPays
                    ? confirmed.heldMilli - speechMaximumMilli
                    : 0n;

                acceptedBudgetMilli =
                    held < confirmed.heldMilli ? held : confirmed.heldMilli;
            }
        }

        const pinned = await capability.pinAction({
            jobId: input.turnId,
            jobKind: 'conversation-turn',
            ownerId: input.ownerId,
            at: now,
            policy: charging,
        });

        if (
            pinned.version !== charging.version ||
            pinned.funding !== charging.funding
        ) {
            throw new ConversationError(
                'model_unavailable',
                'The charging policy changed. Review the refreshed allowance and try again.',
            );
        }

        // Provider dispatch checks the persisted action deadline under its reservation lock.
        // A queued continuation must inherit the same absolute expiry as the lesson.
        const action = await new DrizzleActionAccountingParticipant(tx)
            .reserve({
                id: input.turnId,
                ownerId: input.ownerId,
                capability: 'conversation',
                funding,
                policyVersion: charging.version,
                tariff,
                budgetMilli: authorizedBudgetMilli,
                holdMaximumMilli: acceptedBudgetMilli,
                operatorMaximumMicros: BigInt(
                    execution.budget.maxCostMicrosPerAttempt,
                ),
                operatorSettings: settings,
                at: now,
                deadlineAt: new Date(deadline),
            })
            .catch((error: unknown) => {
                if (error instanceof OperatorBudgetUnavailableError) {
                    throw new ConversationError(
                        'operator_capacity_exhausted',
                        'The AI spending allowance is currently unavailable. Try again later.',
                    );
                }

                throw error;
            });

        return {
            ...execution,
            // Selection precedes reviewed pricing and action/context clamps.
            // Pin the final admitted allowance in both execution representations;
            // the provider factory deliberately rejects a mismatched budget.
            snapshot: {
                ...execution.snapshot,
                aggregateBudget: { ...execution.budget },
            },
            ...(recordingConsentMilli ? { recordingConsentMilli } : {}),
            ...(combined || automatic?.permitsListeningRecording
                ? { permitsListeningRecording: true }
                : {}),
            ...(combined
                ? {
                      listeningSpeechBudget: {
                          maximumCreditsMilli: speechMaximumMilli.toString(),
                          maximumProviderMicros: speechMaximumProviderMicros,
                      },
                  }
                : {}),
            actionAccountingVersion: 1,
            generationAuthorizationFingerprint,
            generationMaximumProviderCostMicros,
            generationMaximumCreditsMilli: customerPays
                ? generationMaximumCreditsMilli.toString()
                : '0',
            providerPrice,
            admittedMaxInputTokens,
            heldCreditsMilli: action.heldMilli.toString(),
            funding: action.funding,
        };
    };

    return Object.assign(admit, {
        prepare: async (tx: Transaction) => {
            if (
                !availability.routingEnabled ||
                availability.pricingAdmissionEnabled === false
            ) {
                return;
            }

            await prepareAdminTextAiRouting(tx, {
                format: 'conversation:v1',
                now: new Date(),
                credentialConfigured: availability.credentialConfigured,
                ...(availability.routeFingerprint
                    ? { routeFingerprint: availability.routeFingerprint }
                    : {}),
            });
        },
    });
}

/** The operation fence surrounds dispatch; numerical settlement survives content deletion. */
export function createConversationAccounting(input: {
    database: Database;
    withOperation<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
    ownerId: string;
    turnId: string;
    leaseToken?: string;
    execution: TextAiAdmissionExecution;
}): TutorAccountingPort {
    if (!usesActionAccounting(input.execution)) {
        throw new Error('Current action accounting execution is required.');
    }

    return createConversationActionAccounting({
        ...input,
        execution: input.execution,
        withTransaction: (work) => input.database.transaction(work),
    });
}

/** Lease recovery finalizes the current action ledger without another dispatch. */
export async function settleInterruptedConversationCalls(
    tx: Transaction,
    turn: typeof turns.$inferSelect,
) {
    if (!usesActionAccounting(turn.execution)) {
        throw new Error('Current action accounting execution is required.');
    }

    const { settleConversationAction } =
        await import('./conversation-action-accounting');

    await settleConversationAction(tx, turn);
}
