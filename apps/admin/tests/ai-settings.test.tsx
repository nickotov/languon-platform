import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
    enabledDefaultModels,
    settingsToFormValues,
    toMutationRequest,
} from '../src/pages/ai-settings/lib/ai-settings-form';
import type { AiSettingsResponse } from '../src/pages/ai-settings/types';
import { ProviderCard } from '../src/pages/ai-settings/ui/provider-card/provider-card';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));

beforeAll(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            addEventListener: vi.fn(),
            matches: false,
            removeEventListener: vi.fn(),
        }),
    );
});

const response: AiSettingsResponse = {
    providers: [
        {
            credentialStatus: 'configured',
            health: {
                checkedAt: '2026-09-23T10:00:00.000Z',
                message: null,
                status: 'available',
            },
            id: 'deepseek',
            label: 'DeepSeek',
            models: [
                {
                    id: 'deepseek-chat',
                    label: 'DeepSeek Chat',
                    available: true,
                    supportedFormats: ['card:v1'],
                    unavailableReason: null,
                },
            ],
        },
        {
            credentialStatus: 'missing',
            health: {
                checkedAt: null,
                message: null,
                status: 'unverified',
            },
            id: 'kie',
            label: 'Kie',
            models: [
                {
                    id: 'gemini-2.5-pro',
                    label: 'Gemini 2.5 Pro',
                    available: false,
                    supportedFormats: ['card:v1'],
                    unavailableReason:
                        'Structured output has not been verified.',
                },
            ],
        },
    ],
    settings: {
        activeProvider: 'deepseek',
        defaultModel: 'deepseek-chat',
        enabledModels: ['deepseek-chat'],
        updatedAt: '2026-09-23T09:00:00.000Z',
        version: 4,
    },
};

describe('AI settings form behavior', () => {
    it('keeps default choices limited to enabled available models', () => {
        expect(
            enabledDefaultModels(
                response.providers,
                'deepseek',
                response.settings.enabledModels,
            ),
        ).toEqual([response.providers[0]?.models[0]]);
        expect(
            enabledDefaultModels(response.providers, 'kie', ['gemini-2.5-pro']),
        ).toEqual([]);
    });

    it('builds a versioned mutation without carrying an old reason', () => {
        expect(settingsToFormValues(response)).toMatchObject({ reason: '' });
        expect(
            toMutationRequest(
                {
                    activeProvider: 'deepseek',
                    defaultModel: 'deepseek-chat',
                    enabledModels: ['deepseek-chat'],
                    reason: '  Change the production default  ',
                },
                response.settings.version,
            ),
        ).toEqual({
            activeProvider: 'deepseek',
            defaultModel: 'deepseek-chat',
            enabledModels: ['deepseek-chat'],
            expectedVersion: 4,
            reason: 'Change the production default',
        });
    });

    it('shows credential and readiness states and preserves other provider selections', () => {
        const handleChange = vi.fn();
        render(
            <ProviderCard
                enabledModelIds={['deepseek-chat', 'gemini-2.5-pro']}
                onEnabledModelsChange={handleChange}
                provider={response.providers[0]!}
            />,
        );

        expect(screen.getByText('Configured')).toBeInTheDocument();
        expect(screen.getByText('Available')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('checkbox', { name: /DeepSeek Chat/i }),
        );
        expect(handleChange).toHaveBeenCalledWith(['gemini-2.5-pro']);
    });

    it('renders missing credentials and disables unavailable models', () => {
        render(
            <ProviderCard
                enabledModelIds={[]}
                onEnabledModelsChange={vi.fn()}
                provider={response.providers[1]!}
            />,
        );

        expect(screen.getByText('Missing')).toBeInTheDocument();
        expect(screen.getByText('Unverified')).toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: /Gemini 2.5 Pro/i }),
        ).toBeDisabled();
    });
});
