import { describe, expect, it, vi } from 'vitest';
import type { TextAiModelsResponse } from '@languon/contracts';
import { TextAiPreferenceService } from '../../../../src/modules/text-ai/application/text-ai-preference-service';
import {
    TextAiModelUnavailableError,
    TextAiPreferenceConflictError,
    type TextAiPreference,
    type TextAiPreferenceSession,
} from '../../../../src/modules/text-ai/domain/text-ai-preference-store';

function harness() {
    let preference: TextAiPreference = {
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
    const service = new TextAiPreferenceService({
        run: async <T>(
            _id: string,
            work: (session: TextAiPreferenceSession) => Promise<T>,
        ) =>
            work({
                read: async () => preference,
                catalog: async () => catalog,
                save,
            }),
    });
    return { service, catalog, save };
}
describe('text AI preference service', () => {
    it('reads Auto version zero and the current platform default', async () => {
        const { service, save } = harness();
        await expect(service.get('learner')).resolves.toMatchObject({
            mode: 'auto',
            modelId: null,
            version: 0,
            selectedModel: { id: 'deepseek-flash' },
        });
        expect(save).not.toHaveBeenCalled();
    });
    it('persists explicit selection and Auto with monotonically increasing versions', async () => {
        const { service } = harness();
        await expect(
            service.update('learner', {
                mode: 'explicit',
                modelId: 'deepseek-flash',
                expectedVersion: 0,
            }),
        ).resolves.toMatchObject({
            mode: 'explicit',
            modelId: 'deepseek-flash',
            version: 1,
        });
        await expect(
            service.update('learner', { mode: 'auto', expectedVersion: 1 }),
        ).resolves.toMatchObject({ mode: 'auto', modelId: null, version: 2 });
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
    it('retains stored disabled selections and allows the user to choose Auto', async () => {
        const { service, catalog } = harness();
        await service.update('learner', {
            mode: 'explicit',
            modelId: 'deepseek-flash',
            expectedVersion: 0,
        });
        catalog.models[0]!.availability = 'disabled';
        catalog.models[0]!.enabled = false;
        await expect(service.get('learner')).resolves.toMatchObject({
            mode: 'explicit',
            modelId: 'deepseek-flash',
            version: 1,
            selectedModel: { availability: 'disabled' },
        });
        await expect(
            service.update('learner', { mode: 'auto', expectedVersion: 1 }),
        ).resolves.toMatchObject({ mode: 'auto', version: 2 });
    });
});
