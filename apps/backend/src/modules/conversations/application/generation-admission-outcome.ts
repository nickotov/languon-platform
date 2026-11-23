import type { GenerationFailure } from '@languon/contracts';
import {
    maximumAutomaticGenerationStages,
    type GenerationAutomationAuthorization,
} from './ports/generation-run';

type AdmissionReason = NonNullable<GenerationFailure['admissionReason']>;
const retryDelaysMs = [5_000, 15_000, 45_000] as const;

const admissionReasons: Readonly<Partial<Record<string, AdmissionReason>>> = {
    context_too_large: 'context-too-large',
    generation_scope_change: 'allowance-required',
    action_confirmation_required: 'allowance-required',
    credits_exhausted: 'balance',
    capacity_unavailable: 'capacity',
    provider_capacity_exhausted: 'provider-capacity',
    operator_capacity_exhausted: 'operator-capacity',
    response_active: 'response-active',
    model_unavailable: 'configuration',
    action_budget_unconfigured: 'configuration',
    conversation_not_found: 'source-unavailable',
    source_changed: 'source-changed',
    version_conflict: 'conflict',
    idempotency_conflict: 'conflict',
};

/** A dispatch-time capacity refusal has no provider receipt. Keep its cause on the saved run. */
export function dispatchCapacityFailure(
    code: string | undefined,
): GenerationFailure | undefined {
    if (
        code === 'provider_capacity_exhausted' ||
        code === 'operator_capacity_exhausted'
    ) {
        return {
            code: 'admission-blocked',
            admissionReason: admissionReasons[code],
        };
    }
}

/** Only a transaction that refused admission can retry without a provider liability. */
export function generationAdmissionOutcome(
    code: string,
    authority: GenerationAutomationAuthorization,
    now: Date,
    requestId: string,
) {
    let reason: AdmissionReason = Object.hasOwn(admissionReasons, code)
        ? admissionReasons[code]!
        : 'unknown';
    const expiresAt = Date.parse(authority.expiresAt);

    if (code === 'generation_scope_change') {
        if (expiresAt <= now.getTime()) {
            reason = 'authority-expired';
        } else if (authority.stageCount >= maximumAutomaticGenerationStages) {
            reason = 'stage-limit';
        }
    }

    const failure: GenerationFailure = {
        code: 'admission-blocked',
        admissionReason: reason,
        referenceId: requestId,
    };
    const count = authority.admissionRetry?.count ?? 0;
    const delay = retryDelaysMs[count];

    if (
        (
            [
                'capacity',
                'response-active',
                'provider-capacity',
                'operator-capacity',
            ] as const
        ).some((transient) => transient === reason) &&
        delay !== undefined &&
        now.getTime() < expiresAt &&
        authority.stageCount < maximumAutomaticGenerationStages
    ) {
        // Wake at expiry even when the next backoff would outlive the authority.
        const retryAt = new Date(
            Math.min(now.getTime() + delay, expiresAt),
        ).toISOString();

        return {
            failure,
            automation: {
                ...authority,
                admissionRetry: { count: count + 1, retryAt },
            },
            pauseReason: 'budget' as const,
        };
    }

    return {
        failure,
        automation: null,
        pauseReason:
            reason === 'source-changed'
                ? ('source-changed' as const)
                : ('technical-failure' as const),
    };
}
