import { describe, expect, it, vi } from 'vitest';
import type { TextAiModelsResponse } from '@languon/contracts';
import { TextAiPreferenceService } from '../../../../src/modules/text-ai/application/text-ai-preference-service';
import {
    TextAiModelUnavailableError,
    TextAiPreferenceConflictError,
    type TextAiPreference,
    type TextAiPreferenceSession,
} from '../../../../src/modules/text-ai/domain/text-ai-preference-store';

function harness(initial?: TextAiPreference) {
    let preference: TextAiPreference = initial ?? {
        mode: 'auto',
        modelId: null,
        version: 0,
    };
    const catalog: TextAiModelsResponse = {
        defaultModelId: 'deepseek-flash',
        models: [
            {
                id: 'deepseek-flash',
                label: 'DeepSeek Flash',
                enabled: true,
                capabilities: ['structured-text'],
                availability: 'available',
                unavailableReason: null,
                creditRates: {
                    inputCreditsPerMillionTokens: 1000000,
                    outputCreditsPerMillionTokens: 3000000,
                },
            },
        ],
    };
    const save = vi.fn(async (next: TextAiPreference) => {
        preference = next;
    });
    const readCatalog = vi.fn(async () => catalog);
    const service = new TextAiPreferenceService({
        run: async <T>(
            _id: string,
            work: (session: TextAiPreferenceSession) => Promise<T>,
        ) =>
            work({
                read: async () => preference,
                catalog: readCatalog,
                save,
            }),
    });
    return { service, catalog, save, readCatalog };
}
describe('text AI preference service', () => {
    it('reads neutral preference without exposing the platform default', async () => {
        const { service, save } = harness();
        await expect(service.get('learner')).resolves.toMatchObject({
            mode: 'auto',
            modelId: null,
            version: 0,
            selectedModel: null,
        });
        expect(save).not.toHaveBeenCalled();
    });
    it('redacts existing explicit preferences without reading or rewriting the catalog', async () => {
        const { service, save, readCatalog } = harness({
            mode: 'explicit',
            modelId: 'retired-provider-model',
            version: 5,
            maxCreditsPerAction: '2.145',
        });
        await expect(service.get('learner')).resolves.toEqual({
            mode: 'auto',
            modelId: null,
            selectedModel: null,
            version: 5,
            maxCreditsPerAction: '2.145',
        });
        await expect(service.models('learner')).resolves.toEqual({
            defaultModelId: null,
            models: [],
        });
        expect(readCatalog).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        await expect(
            service.update('learner', { mode: 'auto', expectedVersion: 5 }),
        ).resolves.toMatchObject({ version: 6, maxCreditsPerAction: '2.145' });
    });
    it('updates exact action budgets without exposing routing identities', async () => {
        const { service } = harness();
        await expect(
            service.update('learner', {
                mode: 'auto',
                expectedVersion: 0,
                maxCreditsPerAction: '2.145',
            }),
        ).resolves.toMatchObject({
            mode: 'auto',
            modelId: null,
            selectedModel: null,
            version: 1,
            maxCreditsPerAction: '2.145',
        });
        await expect(service.models('learner')).resolves.toEqual({
            defaultModelId: null,
            models: [],
        });
    });
    it('rejects stale versions without overwriting the preference', async () => {
        const { service, save } = harness();
        await expect(
            service.update('learner', { mode: 'auto', expectedVersion: 1 }),
        ).rejects.toBeInstanceOf(TextAiPreferenceConflictError);
        expect(save).not.toHaveBeenCalled();
    });
    it('rejects unknown models and unavailable new selections without fallback', async () => {
        const { service, catalog, save } = harness();
        await expect(
            service.update('learner', {
                mode: 'explicit',
                modelId: 'arbitrary-provider',
                expectedVersion: 0,
            }),
        ).rejects.toBeInstanceOf(TextAiModelUnavailableError);
        catalog.models[0]!.availability = 'unavailable';
        await expect(
            service.update('learner', {
                mode: 'explicit',
                modelId: 'deepseek-flash',
                expectedVersion: 0,
            }),
        ).rejects.toBeInstanceOf(TextAiModelUnavailableError);
        expect(save).not.toHaveBeenCalled();
    });
    it('keeps budgets editable even when every provider is unavailable', async () => {
        const { service, catalog } = harness();
        catalog.models[0]!.availability = 'unavailable';
        await expect(
            service.update('learner', {
                mode: 'auto',
                expectedVersion: 0,
                maxCreditsPerAction: '0.001',
            }),
        ).resolves.toMatchObject({
            modelId: null,
            selectedModel: null,
            maxCreditsPerAction: '0.001',
        });
    });
});
