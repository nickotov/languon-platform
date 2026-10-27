import { z } from 'zod';
import { adminMcpReasonSchema } from '@languon/contracts';
import {
    AdminMcpError,
    requireAction,
    requirePermission,
    type AdminMcpActor,
} from '../domain/admin-mcp';
import {
    adminMcpReadSchemas,
    adminMcpWriteSchemas,
    type AdminMcpReadOperation,
    type AdminMcpWriteOperation,
} from './operation-schemas';
import type { AdminMcpAdministrationPort } from './ports/admin-mcp-administration-port';

/** Validated administrative use cases independent of MCP, HTTP and persistence SDKs. */
export class AdminMcpAdministrationService {
    constructor(private readonly operations: AdminMcpAdministrationPort) {}

    async read(
        actor: AdminMcpActor,
        operation: AdminMcpReadOperation,
        raw: unknown,
    ) {
        return this.audited(actor, operation, raw, async () => {
            const schema = adminMcpReadSchemas[operation];
            if (!schema)
                throw new AdminMcpError(
                    'permission_denied',
                    'Unsupported administrative read.',
                );
            requireAction(actor, operation);
            requirePermission(
                actor,
                operation.startsWith('users.')
                    ? 'users.read'
                    : operation.startsWith('financial-reports.')
                      ? 'financial-reports.read'
                      : 'providers.read',
            );
            const { reason, ...input } = schema
                .extend({
                    reason: adminMcpReasonSchema.default(
                        'Explicit delegated administrative inspection',
                    ),
                })
                .parse(raw);
            const value = await this.operations.read(actor, operation, input);
            await this.operations.recordRead(
                actor,
                operation,
                input,
                value,
                reason,
            );
            return value;
        });
    }

    async preview(
        actor: AdminMcpActor,
        operation: AdminMcpWriteOperation,
        raw: unknown,
    ) {
        return this.audited(actor, operation, raw, async () => {
            const schema = adminMcpWriteSchemas[operation];
            if (!schema)
                throw new AdminMcpError(
                    'permission_denied',
                    'Unsupported administrative change.',
                );
            requireAction(actor, operation);
            requirePermission(actor, operation);
            const input = schema.parse(raw);
            const preview = await this.operations.preview(
                actor,
                operation,
                input,
            );
            return { ...preview, limits: actor.limits };
        });
    }

    async apply(actor: AdminMcpActor, raw: unknown) {
        return this.audited(actor, 'preview.apply', raw, async () => {
            const input = z
                .object({ previewId: z.uuid(), operationKey: z.uuid() })
                .strict()
                .parse(raw);
            // Stored preview authority is rechecked with credential, owner and versions at commit.
            return this.operations.apply(
                actor,
                input.previewId,
                input.operationKey,
            );
        });
    }

    private async audited<T>(
        actor: AdminMcpActor,
        operation: string,
        raw: unknown,
        work: () => Promise<T>,
    ): Promise<T> {
        try {
            return await work();
        } catch (error) {
            await this.operations.recordRejected(actor, operation, raw, error);
            throw error;
        }
    }
}
