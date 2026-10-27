import { AdminMcpCheckService } from '../application/admin-mcp-check-service';
import type { AdminMcpCredentialService } from '../application/admin-mcp-credential-service';
import type { TextAiProbeService } from '../../text-ai/application/text-ai-probe-service';
import { AdminMcpCheckBudget } from './admin-mcp-check-budget';
import { AdminMcpQuotaStore } from './persistence/drizzle/admin-mcp-quota-store';
import { AdminMcpRejectionAudit } from './admin-mcp-rejection-audit';
import { probeExpenseId } from './admin-mcp-probe-expense';
import type { AdminMcpDatabase } from './persistence/drizzle/admin-mcp-persistence';

export function createAdminMcpChecks(
    database: AdminMcpDatabase,
    credentials: AdminMcpCredentialService,
    probes: TextAiProbeService,
) {
    return new AdminMcpCheckService({
        credentials,
        probes,
        budget: new AdminMcpCheckBudget(database),
        quotas: new AdminMcpQuotaStore(database),
        rejectionAudit: new AdminMcpRejectionAudit(database),
        expenseId: (id) => probeExpenseId(database, id),
    });
}
