import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { TranscriptionSettingsPanel } from '../src/pages/ai-settings/ui/transcription-settings/transcription-settings-panel';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';
import { useTranscriptionSettings } from '../src/pages/ai-settings/hooks/use-transcription-settings';
import type {
    KnowledgeTranscriptionAdminPreview,
    KnowledgeTranscriptionAdminState,
} from '@languon/contracts';
vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
    useLogout: () => ({ mutate: vi.fn() }),
}));
vi.mock('../src/pages/ai-settings/hooks/use-transcription-settings', () => ({
    useTranscriptionSettings: vi.fn(),
}));
beforeAll(() =>
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            matches: false,
        }),
    ),
);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
function fixture(enabled = false) {
    const config = {
        enabled,
        providerPriceRevisionId: enabled
            ? '11111111-1111-4111-8111-111111111111'
            : null,
        creditsPerMinute: enabled ? '12.345' : null,
        maximumDurationMs: 60_000,
        maximumBytes: 5_242_880,
        maximumProviderCostMicros: 10_000,
        processingControlsRevision: null,
        dataSharingDisabled: false,
        dataSharingEvidence: null,
        billingRulesVerified: enabled,
        billingEvidence: enabled ? 'Reviewed test fixture contract' : null,
    };
    const readiness = {
        ready: false,
        credentialsConfigured: false,
        reasons: ['credentials_missing' as const],
        boundedProviderCostMicros: null,
    };
    const snapshot: KnowledgeTranscriptionAdminState = {
        version: 0,
        current: null,
        readiness,
        prices: [],
        providerId: 'openai',
        modelId: 'gpt-transcribe',
    };
    const preview: KnowledgeTranscriptionAdminPreview = {
        request: {
            revisionId: '22222222-2222-4222-8222-222222222222',
            expectedVersion: 0,
            config,
            reason: 'Reviewed test configuration',
        },
        proof: { expiresAt: '2027-01-01T00:00:00Z', signature: 'a'.repeat(43) },
        readiness,
    };
    const settings = {
        state: snapshot,
        preview,
        loading: false,
        pending: false,
        error: false,
        published: false,
        refresh: vi.fn(),
        clearPreview: vi.fn(),
        review: vi.fn(async () => {}),
        apply: vi.fn(async () => {}),
    };
    vi.mocked(useTranscriptionSettings).mockReturnValue(settings);
    return settings;
}
describe('Transcription settings review controls', () => {
    it('leaves a new customer tariff blank and makes no automatic publication', () => {
        const settings = fixture();
        render(<TranscriptionSettingsPanel />);
        expect(
            screen.getByLabelText(
                'Customer credits per minute of source audio',
            ),
        ).toHaveValue('');
        expect(settings.apply).not.toHaveBeenCalled();
        expect(
            screen.getAllByText('Provider credentials are not configured'),
        ).toHaveLength(2);
    });
    it('shows the distinct processor review gate without an administrator approval checkbox', () => {
        const settings = fixture(true);
        const readiness = {
            ...settings.state.readiness,
            credentialsConfigured: true,
            reasons: ['processing_controls_unapproved' as const],
        };
        settings.state.readiness = readiness;
        settings.preview.readiness = readiness;
        render(<TranscriptionSettingsPanel />);
        expect(
            screen.getAllByText(
                /Select the current engineering-reviewed transcription route revision/,
            ),
        ).toHaveLength(2);
        expect(
            screen.getByRole('button', {
                name: 'Publish reviewed configuration',
            }),
        ).toBeDisabled();
        expect(
            screen.queryByRole('checkbox', { name: /processor approval/i }),
        ).toBeNull();
    });
    it('requires a fresh operator check rather than silently renewing a previous account attestation', () => {
        const settings = fixture(true);
        settings.state.current = {
            ...settings.preview.request.config,
            id: '33333333-3333-4333-8333-333333333333',
            version: 1,
            createdBy: null,
            reason: 'Previous account review',
            createdAt: '2026-10-28T00:00:00Z',
            dataSharingAttestedAt: '2026-10-28T00:00:00Z',
            dataSharingDisabled: true,
            dataSharingEvidence: 'Previous actual account review evidence',
        };
        render(<TranscriptionSettingsPanel />);
        expect(
            screen.getByRole('checkbox', {
                name: /I verified data sharing for training is disabled/,
            }),
        ).not.toBeChecked();
        expect(
            screen.getByLabelText(
                'Organization/project data-sharing review evidence',
            ),
        ).toHaveValue('');
    });
    it('blocks enabled publication when server readiness is missing', () => {
        const settings = fixture(true);
        render(<TranscriptionSettingsPanel />);
        expect(
            screen.getByRole('button', {
                name: 'Publish reviewed configuration',
            }),
        ).toBeDisabled();
        expect(settings.apply).not.toHaveBeenCalled();
    });
    it('allows explicit reviewed disabled preparation without claiming provider readiness', () => {
        const settings = fixture(false);
        render(<TranscriptionSettingsPanel />);
        const publish = screen.getByRole('button', {
            name: 'Publish reviewed configuration',
        });
        expect(publish).toBeEnabled();
        fireEvent.click(publish);
        expect(settings.apply).toHaveBeenCalledTimes(1);
    });
    it('invalidates an old preview when the operator edits configuration fields', () => {
        const settings = fixture();
        render(<TranscriptionSettingsPanel />);
        fireEvent.change(
            screen.getByLabelText(
                'Customer credits per minute of source audio',
            ),
            { target: { value: '3.125' } },
        );
        expect(settings.clearPreview).toHaveBeenCalled();
    });
});
