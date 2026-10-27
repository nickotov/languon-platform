import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
    adminMcpCheckRequestSchema,
    type AdminMcpCheckService,
} from '../../application/admin-mcp-check-service';
import { AdminMcpError, type AdminMcpActor } from '../../domain/admin-mcp';
import { TextAiProbeUnavailableError } from '../../../text-ai/application/ports/text-ai-probe-store';

async function reply(call: () => Promise<unknown>) {
    try {
        return {
            content: [
                { type: 'text' as const, text: JSON.stringify(await call()) },
            ],
        };
    } catch (error) {
        const code =
            error instanceof AdminMcpError ||
            error instanceof TextAiProbeUnavailableError
                ? error.code
                : 'check_failed';
        return {
            isError: true,
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify({
                        error: {
                            code,
                            message:
                                'Check not completed. Read status and current limits before retrying; do not create a new operation key for uncertain work.',
                            correlationId: randomUUID(),
                        },
                    }),
                },
            ],
        };
    }
}
export function registerAdminMcpCheckTools(
    server: McpServer,
    checks: AdminMcpCheckService,
    actor: AdminMcpActor,
    secret: string,
) {
    if (
        !actor.permissions.includes('model-checks.run') ||
        !actor.allowedActions.includes('model-checks.run')
    )
        return;
    server.registerTool(
        'admin_model_check_status',
        {
            description:
                'Read effective limits and optional previous check status by operationKey; never dispatches or spends money.',
            inputSchema: z
                .object({ operationKey: z.uuid().optional() })
                .strict(),
            annotations: { readOnlyHint: true },
        },
        async ({ operationKey }) =>
            reply(() => checks.status(actor, operationKey)),
    );
    server.registerTool(
        'admin_model_check',
        {
            description:
                'Explicit paid synthetic check charged only to operator. Read admin_model_check_status first for effective limits. Use a stable UUID operationKey; retries return status without another provider request.',
            inputSchema: adminMcpCheckRequestSchema,
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => reply(() => checks.run(actor, secret, args)),
    );
}
