import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AdminMcpActor } from '../../../../src/modules/admin-mcp/domain/admin-mcp';
import { AdminMcpError } from '../../../../src/modules/admin-mcp/domain/admin-mcp';
import { TextAiProbeUnavailableError } from '../../../../src/modules/text-ai/application/ports/text-ai-probe-store';

const doubles = vi.hoisted(() => ({
    reserve: vi.fn(),
    effectiveMaximum: vi.fn(),
    authorizeDispatch: vi.fn(),
    settle: vi.fn(),
    get: vi.fn(),
    recordOutcome: vi.fn(),
    recordRejection: vi.fn(),
    probeExpenseId: vi.fn(),
}));

vi.mock(
    '../../../../src/modules/admin-mcp/infrastructure/admin-mcp-check-budget',
    () => ({
        AdminMcpCheckBudget: class {
            reserve = doubles.reserve;
            effectiveMaximum = doubles.effectiveMaximum;
            authorizeDispatch = doubles.authorizeDispatch;
            settle = doubles.settle;
        },
    }),
);

vi.mock(
    '../../../../src/modules/admin-mcp/infrastructure/admin-mcp-probe-expense',
    () => ({ probeExpenseId: doubles.probeExpenseId }),
);

vi.mock(
    '../../../../src/modules/admin-mcp/infrastructure/admin-mcp-rejection-audit',
    () => ({
        AdminMcpRejectionAudit: class {
            record = doubles.recordRejection;
        },
    }),
);

vi.mock(
    '../../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/admin-mcp-quota-store',
    () => ({
        AdminMcpQuotaStore: class {
            get = doubles.get;
            recordOutcome = doubles.recordOutcome;
        },
    }),
);

import { createAdminMcpChecks } from '../../../../src/modules/admin-mcp/infrastructure/admin-mcp-checks';
import { registerAdminMcpCheckTools } from '../../../../src/modules/admin-mcp/interface/http/admin-mcp-check-tools';

const actor: AdminMcpActor = {
    tokenId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    permissions: ['model-checks.run'],
    allowedActions: ['model-checks.run', 'model-checks.status'],
    limits: {
        modelChecks: {
            perCheckUsd: '0.050000',
            perDayUsd: '0.500000',
            concurrency: 1,
        },
    },
};
const operationKey = '00000000-0000-4000-8000-000000000003';
const request = {
    routeId: 'openrouter/openai/gpt-6-luna',
    approvedMaximumCostUsd: '0.010000',
    kind: 'quick' as const,
};
const probe = {
    id: '00000000-0000-4000-8000-000000000004',
    state: 'passed' as const,
    providerCostUsd: '0.003000',
    measurement: 'measured' as const,
};

type ToolHandler = (input: Record<string, unknown>) => Promise<{
    isError?: boolean;
    content: Array<{ text: string }>;
}>;

function setup(
    overrides: {
        actor?: AdminMcpActor;
        authenticate?: ReturnType<typeof vi.fn>;
        run?: ReturnType<typeof vi.fn>;
    } = {},
) {
    const tools = new Map<string, ToolHandler>();
    const server = {
        registerTool: vi.fn(
            (name: string, _definition: unknown, handler: ToolHandler) => {
                tools.set(name, handler);
            },
        ),
    } as unknown as McpServer;
    const authenticate =
        overrides.authenticate ?? vi.fn().mockResolvedValue(actor);
    const run = overrides.run ?? vi.fn().mockResolvedValue(probe);
    const checks = createAdminMcpChecks(
        {} as never,
        { authenticate } as never,
        {
            limits: {
                maximumCostMicros: 10_000n,
                dailyMaximumCostMicros: 500_000n,
                cooldownSeconds: 10,
                evidenceHours: 24,
            },
            run,
        } as never,
    );

    registerAdminMcpCheckTools(
        server,
        checks,
        overrides.actor ?? actor,
        'lmcp_abcdefghijklmnopqrstuvwxyz0123456789ABCDE',
    );
    return { tools, authenticate, run };
}

function errorCode(reply: Awaited<ReturnType<ToolHandler>>) {
    return JSON.parse(reply.content[0]!.text).error.code;
}

beforeEach(() => {
    vi.clearAllMocks();
    doubles.reserve.mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000005',
        replay: false,
    });
    doubles.effectiveMaximum.mockResolvedValue(10_000n);
    doubles.authorizeDispatch.mockResolvedValue(undefined);
    doubles.settle.mockResolvedValue(undefined);
    doubles.get.mockResolvedValue({ state: 'settled' });
    doubles.recordOutcome.mockResolvedValue(undefined);
    doubles.recordRejection.mockResolvedValue(undefined);
    doubles.probeExpenseId.mockResolvedValue(
        '00000000-0000-4000-8000-000000000006',
    );
});

describe('delegated MCP paid model checks', () => {
    it('does not register paid tools when a frozen credential lacks the model-check action', () => {
        const frozen: AdminMcpActor = {
            ...actor,
            allowedActions: ['model-checks.status'],
        };
        const { tools } = setup({ actor: frozen });

        expect(tools.has('admin_model_check')).toBe(false);
        expect(tools.has('admin_model_check_status')).toBe(false);
    });

    it('reports its effective maximum and UTC reset through the non-spending status tool', async () => {
        const { tools } = setup();
        const reply = await tools.get('admin_model_check_status')!({});
        const status = JSON.parse(reply.content[0]!.text);

        expect(status).toMatchObject({
            reservation: null,
            limits: {
                maximumCostUsd: '0.010000',
                applicationMaximumCostUsd: '0.010000',
                applicationDailyMaximumCostUsd: '0.500000',
                tokenDailyMaximumCostUsd: '0.500000',
                cooldownSeconds: 10,
                evidenceHours: 24,
            },
        });
        expect(new Date(status.limits.resetsAt).getUTCHours()).toBe(0);
        expect(doubles.reserve).not.toHaveBeenCalled();
    });

    it('rejects an unconfirmed current effective cap before reserving or dispatching work', async () => {
        const { tools, run } = setup();
        const reply = await tools.get('admin_model_check')!({
            operationKey,
            request: { ...request, approvedMaximumCostUsd: '0.009000' },
            reason: 'Synthetic stale price confirmation',
        });

        expect(reply.isError).toBe(true);
        expect(errorCode(reply)).toBe('stale_preview');
        expect(doubles.reserve).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('uses the lower token ceiling for reservation, approval and provider execution', async () => {
        const restricted: AdminMcpActor = {
            ...actor,
            limits: {
                modelChecks: {
                    perCheckUsd: '0.005000',
                    perDayUsd: '0.500000',
                    concurrency: 1,
                },
            },
        };
        doubles.effectiveMaximum.mockResolvedValueOnce(5_000n);
        const run = vi.fn(
            async (_ownerId, _request, _signal, beforeDispatch) => {
                await beforeDispatch();
                return probe;
            },
        );
        const { tools } = setup({ actor: restricted, run });
        const reply = await tools.get('admin_model_check')!({
            operationKey,
            request: { ...request, approvedMaximumCostUsd: '0.005000' },
            reason: 'Synthetic lower delegated cap',
        });

        expect(reply.isError).toBeUndefined();
        expect(doubles.reserve).toHaveBeenCalledWith(
            restricted,
            operationKey,
            expect.any(Object),
            '0.005000',
        );
        expect(run).toHaveBeenCalledWith(
            restricted.userId,
            expect.objectContaining({ approvedMaximumCostUsd: '0.005000' }),
            expect.any(AbortSignal),
            expect.any(Function),
            5_000n,
        );
    });

    it('requires approval for the lower effective maximum and does not reserve stale approval', async () => {
        doubles.effectiveMaximum.mockResolvedValueOnce(5_000n);
        const { tools, run } = setup();
        const reply = await tools.get('admin_model_check')!({
            operationKey,
            request,
            reason: 'Synthetic stale lower cap confirmation',
        });

        expect(reply.isError).toBe(true);
        expect(errorCode(reply)).toBe('stale_preview');
        expect(doubles.reserve).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('returns the original check state on replay without authenticating or dispatching again', async () => {
        doubles.reserve.mockResolvedValueOnce({
            id: '00000000-0000-4000-8000-000000000005',
            replay: true,
        });
        const { tools, authenticate, run } = setup();
        const reply = await tools.get('admin_model_check')!({
            operationKey,
            request,
            reason: 'Synthetic replay check',
        });

        expect(reply.isError).toBeUndefined();
        expect(JSON.parse(reply.content[0]!.text)).toEqual({
            state: 'settled',
        });
        expect(doubles.get).toHaveBeenCalledWith(actor, operationKey);
        expect(authenticate).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it('fences dispatch, settles the measured provider cost and writes a successful audit outcome', async () => {
        const run = vi.fn(
            async (_ownerId, _request, _signal, beforeDispatch) => {
                await beforeDispatch();
                return probe;
            },
        );
        const { tools } = setup({ run });
        const reply = await tools.get('admin_model_check')!({
            operationKey,
            request,
            reason: 'Synthetic explicit model check',
        });

        expect(reply.isError).toBeUndefined();
        expect(doubles.authorizeDispatch).toHaveBeenCalledWith(
            actor,
            '00000000-0000-4000-8000-000000000005',
        );
        expect(doubles.settle).toHaveBeenCalledWith(
            actor,
            '00000000-0000-4000-8000-000000000005',
            '0.003000',
            probe,
        );
        expect(doubles.recordOutcome).toHaveBeenCalledWith(
            actor,
            'model-check.completed',
            probe.id,
            'Synthetic explicit model check',
            expect.objectContaining({
                reservationId: '00000000-0000-4000-8000-000000000005',
                costUsd: '0.003000',
                providerExpenseId: '00000000-0000-4000-8000-000000000006',
            }),
            'success',
        );
    });

    it('settles zero and records a rejected outcome when live authority denies pre-dispatch execution', async () => {
        const authenticate = vi
            .fn()
            .mockRejectedValue(new AdminMcpError('unauthorized', 'Revoked'));
        const { tools, run } = setup({ authenticate });
        const reply = await tools.get('admin_model_check')!({
            operationKey,
            request,
            reason: 'Synthetic revoked before dispatch',
        });

        expect(reply.isError).toBe(true);
        expect(errorCode(reply)).toBe('unauthorized');
        expect(run).not.toHaveBeenCalled();
        expect(doubles.settle).toHaveBeenCalledWith(
            actor,
            '00000000-0000-4000-8000-000000000005',
            '0',
            expect.objectContaining({ code: 'check_not_dispatched' }),
        );
        expect(doubles.recordOutcome).toHaveBeenCalledWith(
            actor,
            'model-check.failed',
            '00000000-0000-4000-8000-000000000005',
            'Synthetic revoked before dispatch',
            expect.objectContaining({ state: 'not_dispatched' }),
            'rejected',
        );
        expect(doubles.recordRejection).toHaveBeenCalledWith(
            actor,
            'model-check.rejected',
            {
                operationKey,
                request,
                reason: 'Synthetic revoked before dispatch',
            },
            expect.objectContaining({ code: 'unauthorized' }),
        );
    });

    it('audits a rejected reservation admission without dispatching a provider call', async () => {
        doubles.reserve.mockRejectedValueOnce(
            new TextAiProbeUnavailableError('probe_budget_insufficient'),
        );
        const { tools, run } = setup();
        const reply = await tools.get('admin_model_check')!({
            operationKey,
            request,
            reason: 'Synthetic exhausted operator budget',
        });

        expect(reply.isError).toBe(true);
        expect(errorCode(reply)).toBe('probe_budget_insufficient');
        expect(run).not.toHaveBeenCalled();
        expect(doubles.recordRejection).toHaveBeenCalledWith(
            actor,
            'model-check.rejected',
            {
                operationKey,
                request,
                reason: 'Synthetic exhausted operator budget',
            },
            expect.objectContaining({ code: 'probe_budget_insufficient' }),
        );
    });
});
