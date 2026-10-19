import { describe, expect, it } from 'vitest';
import {
    TextAiModelsResponseSchema,
    UpdateTextAiPreferenceRequestSchema,
} from '../src/text-ai';
describe('text AI public contracts', () => {
    it('accepts Auto or explicit optimistic updates and rejects caller identity', () => {
        expect(
            UpdateTextAiPreferenceRequestSchema.parse({
                mode: 'auto',
                expectedVersion: 0,
            }),
        ).toEqual({ mode: 'auto', expectedVersion: 0 });
        expect(
            UpdateTextAiPreferenceRequestSchema.safeParse({
                mode: 'explicit',
                modelId: 'deepseek-flash',
                expectedVersion: 2,
            }).success,
        ).toBe(true);
        expect(
            UpdateTextAiPreferenceRequestSchema.safeParse({
                mode: 'auto',
                expectedVersion: 0,
                userId: 'other',
            }).success,
        ).toBe(false);
        expect(
            UpdateTextAiPreferenceRequestSchema.safeParse({
                mode: 'auto',
                expectedVersion: 0,
                modelId: 'deepseek-flash',
            }).success,
        ).toBe(false);
    });
    it('rejects internal catalog fields in the public response', () => {
        expect(
            TextAiModelsResponseSchema.safeParse({
                defaultModelId: null,
                models: [],
                credentialReference: 'DEEPSEEK_API_KEY',
            }).success,
        ).toBe(false);
    });
});
