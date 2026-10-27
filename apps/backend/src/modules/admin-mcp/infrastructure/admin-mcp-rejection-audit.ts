import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { TextAiFlowIdSchema } from '@languon/contracts';
import { textAiModelCatalog } from '../../text-ai/application/text-ai-provider-catalog';
import {
    AdminMcpError,
    assertSafeAuditContext,
    type AdminMcpActor,
} from '../domain/admin-mcp';
import {
    audit,
    payloadHash,
    type AdminMcpDatabase,
} from './persistence/drizzle/admin-mcp-persistence';
import { adminMcpPreviewsTable } from './persistence/drizzle/schema';

function safeReason(raw: unknown): string {
    const reason = z.string().trim().min(5).max(500).safeParse(raw);
    if (reason.success) {
        try {
            assertSafeAuditContext(reason.data);
            return reason.data;
        } catch {
            /* Credential-shaped context must not be persisted. */
        }
    }
    return 'Delegated operation rejected; no safe caller reason supplied';
}
function fields(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}
function safeScalars(raw: unknown) {
    const source = fields(raw);
    const safe: Record<string, unknown> = {};
    for (const key of ['expectedVersion', 'managementVersion', 'version']) {
        const value = source[key];
        if (
            typeof value === 'number' &&
            Number.isSafeInteger(value) &&
            value >= 0
        )
            safe[key] = value;
    }
    for (const key of [
        'amountCredits',
        'maxCreditsPerAction',
        'defaultMaxCreditsPerAction',
        'maxProviderCostUsdPerAction',
        'maxProviderCostUsdPerAccountDay',
        'maxProviderCostUsdPerDay',
    ]) {
        const value = source[key];
        if (
            typeof value === 'string' &&
            /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(value)
        )
            safe[key] = value;
    }
    return safe;
}
/** Safe post-rollback disclosure: identifiers and financial scalars, never raw request/configuration bodies. */
export class AdminMcpRejectionAudit {
    constructor(private readonly database: AdminMcpDatabase) {}
    async recordRead(
        actor: AdminMcpActor,
        operation: string,
        raw: unknown,
        value: unknown,
        reason: string,
    ) {
        const input = fields(raw);
        const output = fields(value);
        const user = fields(output.user);
        const resolved = z.uuid().safeParse(user.id ?? input.userId);
        const target = resolved.success ? resolved.data : operation;
        const metadata: Record<string, unknown> = {};
        for (const key of ['page', 'pageSize']) {
            const n = input[key];
            if (typeof n === 'number' && Number.isSafeInteger(n))
                metadata[key] = n;
        }
        for (const key of ['from', 'to']) {
            const date = z.iso.datetime().safeParse(input[key]);
            if (date.success) metadata[key] = date.data;
        }
        await this.database.transaction((tx) =>
            audit(
                tx,
                actor,
                operation,
                target,
                safeReason(reason),
                new Date(),
                metadata,
                'success',
            ),
        );
    }
    async record(
        actor: AdminMcpActor,
        operation: string,
        raw: unknown,
        error: unknown,
    ) {
        const input = fields(raw);
        const previewId = z.uuid().safeParse(input.previewId);
        const targetId = z.uuid().safeParse(input.targetUserId ?? input.userId);
        const operationKey = z.uuid().safeParse(input.operationKey);
        let target = targetId.success ? targetId.data : operation;
        let reason = safeReason(input.reason);
        const metadata: Record<string, unknown> = {
            operation,
            code:
                error instanceof AdminMcpError
                    ? error.code
                    : 'operation_rejected',
            proposed: safeScalars(raw),
        };
        if (operationKey.success)
            metadata.operationKeyHash = payloadHash(operationKey.data);
        if (previewId.success) {
            metadata.previewId = previewId.data;
            const [preview] = await this.database
                .select()
                .from(adminMcpPreviewsTable)
                .where(
                    and(
                        eq(adminMcpPreviewsTable.id, previewId.data),
                        eq(adminMcpPreviewsTable.tokenId, actor.tokenId),
                    ),
                )
                .limit(1);
            if (preview) {
                operation = preview.operation;
                target = preview.target;
                reason = safeReason(preview.reason);
                metadata.operation = operation;
                metadata.before = safeScalars(preview.current);
                metadata.proposed = safeScalars(preview.proposed);
                metadata.expectedVersion = preview.expectedVersion;
            }
        }
        const request = fields(input.request);
        const routeId = request.routeId;
        if (
            typeof routeId === 'string' &&
            textAiModelCatalog.some(
                (model) => `${model.providerId}/${model.id}` === routeId,
            )
        ) {
            target = routeId;
            metadata.routeId = routeId;
            const flow = TextAiFlowIdSchema.safeParse(request.flowId);
            if (flow.success) metadata.flowId = flow.data;
        }
        await this.database.transaction((tx) =>
            audit(
                tx,
                actor,
                operation,
                target,
                reason,
                new Date(),
                metadata,
                'rejected',
            ),
        );
    }
}
