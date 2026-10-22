import { describe, expect, it } from 'vitest';
import {
    AiCapabilitySchema,
    AiAccountingSettingsPublishSchema,
    CapabilityPolicyPublishSchema,
    CapabilityPolicySchema,
} from '@languon/contracts';
import { initialCapabilityPolicy } from '../../../../../src/modules/ai-credits/domain/capability-policy';

describe('capability charging policy', () => {
    it('defaults interviews to operator funding with a stable version-zero snapshot', () => {
        expect(initialCapabilityPolicy('portrait-interview')).toEqual({
            capability: 'portrait-interview',
            version: 0,
            revisionId: null,
            funding: 'operator',
            updatedAt: null,
        });
    });
    it('preserves customer-funded defaults for other existing capabilities', () => {
        for (const capability of AiCapabilitySchema.options.filter(
            (value) => value !== 'portrait-interview',
        )) {
            expect(
                CapabilityPolicySchema.parse(
                    initialCapabilityPolicy(capability),
                ).funding,
            ).toBe('customer');
        }
    });
    it('allows an uncalibrated null default and validates configured exact budgets', () => {
        expect(
            AiAccountingSettingsPublishSchema.parse({
                expectedVersion: 0,
                defaultMaxCreditsPerAction: null,
                reason: 'Await initial calibration',
            }).defaultMaxCreditsPerAction,
        ).toBeNull();
        expect(
            AiAccountingSettingsPublishSchema.parse({
                expectedVersion: 0,
                defaultMaxCreditsPerAction: '1.001',
                reason: 'Calibrated development budget',
            }).defaultMaxCreditsPerAction,
        ).toBe('1.001');
        expect(
            AiAccountingSettingsPublishSchema.safeParse({
                expectedVersion: 0,
                defaultMaxCreditsPerAction: '0.0001',
                reason: 'Invalid precision setting',
            }).success,
        ).toBe(false);
    });
    it('rejects unsupported funding, capabilities, missing reason and invalid concurrency version', () => {
        const input = {
            capability: 'portrait-interview',
            expectedVersion: 0,
            funding: 'operator',
            reason: 'Free interviews',
        };
        expect(CapabilityPolicyPublishSchema.parse(input)).toEqual(input);
        for (const invalid of [
            { funding: 'unlimited' },
            { capability: 'arbitrary-provider' },
            { reason: '' },
            { expectedVersion: -1 },
            { expectedVersion: 1.1 },
        ]) {
            expect(
                CapabilityPolicyPublishSchema.safeParse({
                    ...input,
                    ...invalid,
                }).success,
            ).toBe(false);
        }
    });
});
