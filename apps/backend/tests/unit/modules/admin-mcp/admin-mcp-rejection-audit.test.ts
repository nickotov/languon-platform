import type { AdminMcpActor } from '../../../../src/modules/admin-mcp/domain/admin-mcp';
import type * as Persistence from '../../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/admin-mcp-persistence';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminMcpError } from '../../../../src/modules/admin-mcp/domain/admin-mcp';

const doubles = vi.hoisted(() => ({ audit: vi.fn() }));

vi.mock(
    '../../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/admin-mcp-persistence',
    async (importOriginal) => {
        const actual = await importOriginal<typeof Persistence>();
        return { ...actual, audit: doubles.audit };
    },
);

import { AdminMcpRejectionAudit } from '../../../../src/modules/admin-mcp/infrastructure/admin-mcp-rejection-audit';
import { payloadHash } from '../../../../src/modules/admin-mcp/infrastructure/persistence/drizzle/admin-mcp-persistence';

const actor: AdminMcpActor = {
    tokenId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    permissions: ['credits.grant'],
    allowedActions: ['credits.grant'],
    limits: { creditGrants: { perOperation: '10', perDay: '10' } },
};
const previewId = '00000000-0000-4000-8000-000000000003';
const targetUserId = '00000000-0000-4000-8000-000000000004';
const operationKey = '00000000-0000-4000-8000-000000000005';

function database(preview: unknown = null) {
    return {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue(preview ? [preview] : []),
                })),
            })),
        })),
        transaction: vi.fn(async (work) => work({})),
    } as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    doubles.audit.mockResolvedValue(undefined);
});

describe('post-rollback MCP rejection auditing', () => {
    it('uses only the token-owned preview to retain its target, reason, versions and bounded credit amount', async () => {
        const audit = new AdminMcpRejectionAudit(
            database({
                operation: 'credits.grant',
                target: targetUserId,
                reason: 'Correct the synthetic learner balance',
                current: {
                    managementVersion: 4,
                    availableCredits: '4.000',
                    privateNote: 'never persist this',
                },
                proposed: {
                    amountCredits: '2.145',
                    embeddedPrompt: 'never persist this either',
                },
                expectedVersion: '4',
            }),
        );

        await audit.record(
            actor,
            'preview.apply',
            {
                previewId,
                operationKey,
                targetUserId: '00000000-0000-4000-8000-000000000099',
                reason: 'Untrusted request reason',
                configuration: {
                    entire: 'raw configuration must not be audited',
                },
            },
            new AdminMcpError('stale_preview', 'Version changed'),
        );

        expect(doubles.audit).toHaveBeenCalledWith(
            {},
            actor,
            'credits.grant',
            targetUserId,
            'Correct the synthetic learner balance',
            expect.any(Date),
            {
                operation: 'credits.grant',
                code: 'stale_preview',
                previewId,
                operationKeyHash: payloadHash(operationKey),
                before: { managementVersion: 4 },
                proposed: { amountCredits: '2.145' },
                expectedVersion: '4',
            },
            'rejected',
        );
    });

    it('records only curated check route and flow context, hashes the operation key, and excludes raw request content', async () => {
        const audit = new AdminMcpRejectionAudit(database());
        await audit.record(
            actor,
            'model-check.rejected',
            {
                operationKey,
                reason: 'Synthetic checked model route',
                request: {
                    routeId: 'openrouter/openai/gpt-6-luna',
                    flowId: 'sentence-check',
                    prompt: 'private user text must not be retained',
                    headers: { Authorization: 'Bearer hidden-value' },
                },
            },
            new AdminMcpError('quota_exceeded', 'No capacity'),
        );

        const metadata = vi.mocked(doubles.audit).mock.calls[0]?.[6] as Record<
            string,
            unknown
        >;
        expect(vi.mocked(doubles.audit).mock.calls[0]?.slice(2, 5)).toEqual([
            'model-check.rejected',
            'openrouter/openai/gpt-6-luna',
            'Synthetic checked model route',
        ]);
        expect(metadata).toMatchObject({
            operation: 'model-check.rejected',
            code: 'quota_exceeded',
            routeId: 'openrouter/openai/gpt-6-luna',
            flowId: 'sentence-check',
            operationKeyHash: payloadHash(operationKey),
        });
        expect(JSON.stringify(metadata)).not.toContain(operationKey);
        expect(JSON.stringify(metadata)).not.toContain('private user text');
        expect(JSON.stringify(metadata)).not.toContain('hidden-value');
    });

    it('replaces credential-shaped or unsafe reasons and never persists raw configuration or user content', async () => {
        const audit = new AdminMcpRejectionAudit(database());
        await audit.record(
            actor,
            'routing.write',
            {
                reason: 'lmcp_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
                configuration: {
                    providers: ['untrusted raw configuration'],
                    userContent: 'private learning material',
                },
                amountCredits: '1.000',
            },
            new Error('Unexpected internal failure'),
        );

        const call = vi.mocked(doubles.audit).mock.calls[0]!;
        expect(call[4]).toBe(
            'Delegated operation rejected; no safe caller reason supplied',
        );
        expect(call[6]).toEqual({
            operation: 'routing.write',
            code: 'operation_rejected',
            proposed: { amountCredits: '1.000' },
        });
        expect(JSON.stringify(call)).not.toContain('lmcp_');
        expect(JSON.stringify(call)).not.toContain('private learning material');
        expect(JSON.stringify(call)).not.toContain(
            'untrusted raw configuration',
        );
    });
});
