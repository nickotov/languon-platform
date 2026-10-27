import {
    adminMcpAuditQuerySchema,
    adminMcpAuditResponseSchema,
    type AdminMcpAuditQuery,
    adminMcpIssueTokenSchema,
    adminMcpIssueTokenResponseSchema,
    adminMcpTokenListResponseSchema,
    adminMcpRevokeTokenResponseSchema,
    adminMcpRevokeTokenSchema,
    type AdminMcpIssueToken,
} from '@languon/contracts';
import { authorized, authorizedSingleRequest } from './admin-api';

export const adminMcpApi = {
    audit: (query: AdminMcpAuditQuery, signal?: AbortSignal) => {
        const parsed = adminMcpAuditQuerySchema.parse(query);
        const params = new URLSearchParams({
            page: String(parsed.page),
            pageSize: String(parsed.pageSize),
        });
        return authorized(
            `/admin/mcp/audit?${params}`,
            adminMcpAuditResponseSchema,
            signal,
        );
    },
    list: (signal?: AbortSignal) =>
        authorized(
            '/admin/mcp/tokens',
            adminMcpTokenListResponseSchema,
            signal,
        ),
    issue: (body: AdminMcpIssueToken) =>
        authorizedSingleRequest(
            '/admin/mcp/tokens',
            body,
            adminMcpIssueTokenSchema,
            adminMcpIssueTokenResponseSchema,
        ),
    revoke: (tokenId: string, reason: string) =>
        authorizedSingleRequest(
            `/admin/mcp/tokens/${encodeURIComponent(tokenId)}/revoke`,
            { reason },
            adminMcpRevokeTokenSchema,
            adminMcpRevokeTokenResponseSchema,
        ),
};
