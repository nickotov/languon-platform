import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EmergencyDisableDialog } from '../src/pages/ai-settings/ui/text-ai-routing/emergency-disable-dialog';
import { ProbeControls } from '../src/pages/ai-settings/ui/text-ai-routing/probe-controls';
import { ProbeRecovery } from '../src/pages/ai-settings/ui/text-ai-routing/probe-recovery';
import { ProbeResult } from '../src/pages/ai-settings/ui/text-ai-routing/probe-result';
import {
    probeEvidenceAge,
    reviewedRouteOptions,
    routingInitialValues,
} from '../src/pages/ai-settings/lib/text-ai-routing-form';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';
import { adminApi } from '../src/shared/api/admin-api';
import { accessTokenStore } from '../src/shared/auth/access-token-store';
import type { TextAiProbe } from '@languon/contracts';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));

beforeAll(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            matches: false,
        }),
    );
});
afterEach(() => {
    cleanup();
    accessTokenStore.clear();
    vi.restoreAllMocks();
});

const catalog = [
    {
        routeId: 'evolink/gpt-6-luna',
        label: 'GPT-6 Luna',
        providerId: 'evolink',
        modelId: 'gpt-6-luna',
        configured: true,
        retired: false,
        processingEligible: true,
        supportedFlows: [],
    },
];
const probe: TextAiProbe = {
    id: '00000000-0000-4000-8000-000000000001',
    routeId: 'evolink/gpt-6-luna',
    kind: 'flow',
    flowId: 'sentence-check',
    state: 'failed',
    failure: 'model_retired',
    startedAt: '2026-10-25T10:00:00.000Z',
    completedAt: '2026-10-25T10:00:01.000Z',
    elapsedMs: 1000,
    firstOutputMs: null,
    inputTokens: null,
    outputTokens: null,
    measurement: 'unknown',
    providerCostUsd: null,
    maximumCostUsd: '0.01',
    evidenceExpiresAt: null,
};
const limits = {
    maximumCostUsd: '0.01',
    dailyMaximumCostUsd: '0.10',
    cooldownSeconds: 10,
    evidenceHours: 24,
};

function validToken() {
    accessTokenStore.set(
        'test-token',
        new Date(Date.now() + 600_000).toISOString(),
    );
}
function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('admin routing safety and API boundary', () => {
    it('keeps setup empty rather than inventing a route or tariffs', () => {
        expect(routingInitialValues(null)).toEqual({
            reason: '',
            enabledRouteIds: [],
            default: { primaryRouteId: '', fallbackRouteIds: [] },
            overrides: {},
            flowTariffs: {},
        });
        expect(reviewedRouteOptions(catalog)).toEqual([
            {
                value: 'evolink/gpt-6-luna',
                label: 'evolink · GPT-6 Luna',
                disabled: false,
            },
        ]);
        expect(
            reviewedRouteOptions([{ ...catalog[0]!, configured: false }])[0]
                ?.disabled,
        ).toBe(true);
        expect(
            reviewedRouteOptions([{ ...catalog[0]!, retired: true }])[0]
                ?.disabled,
        ).toBe(true);
    });

    it('distinguishes stale evidence and preserves unknown cost', () => {
        expect(probeEvidenceAge(null)).toBe('none');
        expect(
            probeEvidenceAge(
                '2026-10-25T10:00:00.000Z',
                Date.parse('2026-10-25T11:00:00.000Z'),
            ),
        ).toBe('stale');
        expect(
            probeEvidenceAge(
                '2026-10-25T10:00:00.000Z',
                Date.parse('2026-10-25T09:00:00.000Z'),
            ),
        ).toBe('fresh');
        render(<ProbeResult probe={probe} />);
        expect(screen.getByText('Unknown')).toBeInTheDocument();
        expect(
            screen.getByText(
                'The provider has retired this model. Select a supported route.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('$0')).not.toBeInTheDocument();
    });

    it('does not start a paid probe merely by opening controls', () => {
        const run = vi.fn();
        render(
            <ProbeControls
                catalog={catalog}
                probes={[]}
                limits={limits}
                pending={false}
                onRun={run}
                onRecover={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Run check' }),
        ).toBeDisabled();
        expect(
            screen.getByText(/Maximum USD 0.01 per check/),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('checkbox', {
                name: 'I approve this operator expense up to the displayed maximum.',
            }),
        );
        expect(screen.getByRole('button', { name: 'Run check' })).toBeEnabled();
        expect(run).not.toHaveBeenCalled();
    });

    it('sends exactly one explicit synthetic probe to the admin endpoint', async () => {
        validToken();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(json(probe));
        await expect(
            adminApi.runTextAiProbe({
                routeId: probe.routeId,
                kind: 'flow',
                flowId: 'sentence-check',
                approvedMaximumCostUsd: '0.01',
            }),
        ).resolves.toEqual(probe);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0]!;
        expect(String(url)).toMatch(/\/admin\/ai-settings\/probes$/);
        expect(request?.method).toBe('POST');
        expect(JSON.parse(String(request?.body))).toEqual({
            routeId: probe.routeId,
            kind: 'flow',
            flowId: 'sentence-check',
            approvedMaximumCostUsd: '0.01',
        });
    });

    it('preserves recent-authentication refusal without refreshing and replaying a probe', async () => {
        validToken();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            json(
                {
                    error: {
                        code: 'recent_authentication_required',
                        correlationId: 'test',
                        message: 'Sign in again.',
                    },
                },
                403,
            ),
        );
        await expect(
            adminApi.runTextAiProbe({
                routeId: probe.routeId,
                kind: 'quick',
                approvedMaximumCostUsd: '0.01',
            }),
        ).rejects.toMatchObject({ status: 403 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('preserves the disable reason when the server reports a revision conflict', async () => {
        const publish = vi.fn().mockResolvedValue(undefined);
        const revision = {
            id: '00000000-0000-4000-8000-000000000002',
            version: 4,
            createdAt: '2026-10-25T10:00:00.000Z',
            configuration: {
                default: {
                    primaryRouteId: probe.routeId,
                    fallbackRouteIds: [],
                },
                enabledRouteIds: [probe.routeId],
                overrides: {},
                flowTariffs: {},
            },
        };
        const props = {
            routeId: probe.routeId,
            revision,
            pending: false,
            error: null,
            onClose: vi.fn(),
            onPublish: publish,
        };
        const view = render(<EmergencyDisableDialog {...props} />);
        const reason = screen.getByLabelText('Reason for change');
        fireEvent.change(reason, {
            target: { value: 'Confirmed upstream retirement' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Disable route' }));
        await waitFor(() =>
            expect(publish).toHaveBeenCalledWith({
                expectedVersion: 4,
                routeId: probe.routeId,
                reason: 'Confirmed upstream retirement',
            }),
        );
        view.rerender(
            <EmergencyDisableDialog
                {...props}
                error={new Error('Routing changed. Refresh and review again.')}
            />,
        );
        expect(
            screen.getByText('Routing changed. Refresh and review again.'),
        ).toBeInTheDocument();
        expect(reason).toHaveValue('Confirmed upstream retirement');
    });

    it('requires upstream-stop attestation before recovering uncertain provider execution', async () => {
        const recover = vi.fn().mockResolvedValue(undefined);
        render(
            <ProbeRecovery
                probe={{ ...probe, failure: 'execution_unknown' }}
                pending={false}
                onRecover={recover}
            />,
        );
        const button = screen.getByRole('button', {
            name: 'Confirm provider recovery',
        });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Reason for recovery'), {
            target: {
                value: 'Confirmed stopped in synthetic provider console',
            },
        });
        expect(button).toBeDisabled();
        fireEvent.click(
            screen.getByRole('checkbox', {
                name: 'I checked the provider and confirm this upstream request has stopped.',
            }),
        );
        await waitFor(() => expect(button).toBeEnabled());
        fireEvent.click(button);
        await waitFor(() =>
            expect(recover).toHaveBeenCalledWith(probe.id, {
                reason: 'Confirmed stopped in synthetic provider console',
                confirmedUpstreamStopped: true,
            }),
        );
        expect(
            screen.getByText(
                /original maximum USD 0.01 remains counted as unknown/i,
            ),
        ).toBeInTheDocument();
    });

    it('loads routing through the dedicated validated endpoint', async () => {
        validToken();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(json({ revision: null, catalog: [] }));
        await expect(adminApi.textAiRouting()).resolves.toEqual({
            revision: null,
            catalog: [],
        });
        expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
            /\/admin\/ai\/routing$/,
        );
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });
});
