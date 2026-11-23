import { describe, expect, it } from 'vitest';
import type { GenerationAutomationAuthorization } from './ports/generation-run';
import {
    dispatchCapacityFailure,
    generationAdmissionOutcome,
} from './generation-admission-outcome';

const now = new Date('2026-01-01T00:00:00Z');
const requestId = '22ea3b38-ccc1-45fa-8974-586235e610ca';
const authority: GenerationAutomationAuthorization = {
    authorizationId: requestId,
    revision: 1,
    rootActionId: requestId,
    actionIds: [requestId],
    maximumCreditsMilli: '0',
    maximumProviderCostMicros: 999,
    authorizationFingerprint: 'fixture',
    expiresAt: new Date(+now + 900_000).toISOString(),
    stageCount: 1,
    ready: true,
};

describe('automatic stage admission outcomes', () => {
    it.each([
        'capacity_unavailable',
        'response_active',
        'provider_capacity_exhausted',
        'operator_capacity_exhausted',
    ])('delays %s three times before requiring a user action', (code) => {
        let current = authority;
        let clock = now;
        for (const [i, ms] of [5_000, 15_000, 45_000].entries()) {
            const outcome = generationAdmissionOutcome(
                code,
                current,
                clock,
                requestId,
            );

            expect(outcome.pauseReason).toBe('budget');
            clock = new Date(+clock + ms);
            expect(outcome.automation?.admissionRetry).toEqual({
                count: i + 1,
                retryAt: clock.toISOString(),
            });

            current = outcome.automation!;
        }

        const terminal = generationAdmissionOutcome(
            code,
            current,
            clock,
            requestId,
        );

        expect(terminal.automation).toBeNull();
        expect(terminal.pauseReason).toBe('technical-failure');
    });

    it('preserves dispatch-time provider capacity refusals without classifying transport as admission', () => {
        expect(dispatchCapacityFailure('provider_capacity_exhausted')).toEqual({
            code: 'admission-blocked',
            admissionReason: 'provider-capacity',
        });
        expect(
            dispatchCapacityFailure('generation_transport_failure'),
        ).toBeUndefined();
    });

    it('wakes at authorization expiry and records separate limit and expiry reasons', () => {
        const expiresAt = new Date(+now + 1000).toISOString();
        const expiring = { ...authority, expiresAt };
        expect(
            generationAdmissionOutcome(
                'capacity_unavailable',
                expiring,
                now,
                requestId,
            ).automation?.admissionRetry?.retryAt,
        ).toBe(expiresAt);

        expect(
            generationAdmissionOutcome(
                'generation_scope_change',
                expiring,
                new Date(expiresAt),
                requestId,
            ).failure.admissionReason,
        ).toBe('authority-expired');

        expect(
            generationAdmissionOutcome(
                'generation_scope_change',
                { ...authority, stageCount: 8 },
                now,
                requestId,
            ).failure.admissionReason,
        ).toBe('stage-limit');
    });

    it.each([
        ['source_changed', 'source-changed'],
        ['context_too_large', 'context-too-large'],
        ['credits_exhausted', 'balance'],
        ['model_unavailable', 'configuration'],
        ['private implementation error', 'unknown'],
        ['constructor', 'unknown'],
    ])(
        'retains a bounded reason and opaque reference for %s',
        (code, reason) => {
            const result = generationAdmissionOutcome(
                code,
                authority,
                now,
                requestId,
            );

            expect(result.failure).toEqual({
                code: 'admission-blocked',
                admissionReason: reason,
                referenceId: requestId,
            });

            expect(result.automation).toBeNull();
        },
    );
});
