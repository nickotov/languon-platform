import type { AdminMcpAdministrationPort } from '../application/ports/admin-mcp-administration-port';
import type {
    AdminMcpReadOperation,
    AdminMcpWriteOperation,
} from '../application/operation-schemas';
import type { AdminMcpActor } from '../domain/admin-mcp';
import type { AdminMcpOperations } from './operations/admin-mcp-operations';
import { AdminMcpPreviewStore } from './persistence/drizzle/admin-mcp-preview-store';
import type { AdminMcpDatabase } from './persistence/drizzle/admin-mcp-persistence';
import { AdminMcpRejectionAudit } from './admin-mcp-rejection-audit';

/** Infrastructure composition retains each existing atomic mutation/replay boundary. */
export class AdminMcpAdministrationAdapter implements AdminMcpAdministrationPort {
    private readonly previews: AdminMcpPreviewStore;
    private readonly audit: AdminMcpRejectionAudit;
    constructor(
        private readonly database: AdminMcpDatabase,
        private readonly operations: AdminMcpOperations,
    ) {
        this.previews = new AdminMcpPreviewStore(database);
        this.audit = new AdminMcpRejectionAudit(database);
    }
    read(
        actor: AdminMcpActor,
        operation: AdminMcpReadOperation,
        input: unknown,
    ) {
        return this.operations.read(actor, operation, input);
    }
    async preview(
        actor: AdminMcpActor,
        operation: AdminMcpWriteOperation,
        input: unknown,
    ) {
        const disclosed = await this.database.transaction((tx) =>
            this.operations.preview(tx, actor, operation, input),
        );
        return this.previews.create(actor, disclosed);
    }
    apply(actor: AdminMcpActor, previewId: string, operationKey: string) {
        return this.previews.executePreview(
            actor,
            previewId,
            operationKey,
            (tx, preview) => this.operations.apply(tx, actor, preview),
        );
    }
    recordRead(
        actor: AdminMcpActor,
        operation: string,
        input: unknown,
        value: unknown,
        reason: string,
    ) {
        return this.audit.recordRead(actor, operation, input, value, reason);
    }
    recordRejected(
        actor: AdminMcpActor,
        operation: string,
        input: unknown,
        error: unknown,
    ) {
        return this.audit.record(actor, operation, input, error);
    }
}
