import type { AdminMcpActor, AdminMcpPreview } from '../../domain/admin-mcp';
import type {
    AdminMcpReadOperation,
    AdminMcpWriteOperation,
} from '../operation-schemas';

/** Application operations own transaction and financial invariants behind this boundary. */
export interface AdminMcpAdministrationPort {
    read(
        actor: AdminMcpActor,
        operation: AdminMcpReadOperation,
        input: unknown,
    ): Promise<unknown>;
    preview(
        actor: AdminMcpActor,
        operation: AdminMcpWriteOperation,
        input: unknown,
    ): Promise<AdminMcpPreview>;
    apply(
        actor: AdminMcpActor,
        previewId: string,
        operationKey: string,
    ): Promise<unknown>;
    recordRead(
        actor: AdminMcpActor,
        operation: string,
        input: unknown,
        value: unknown,
        reason: string,
    ): Promise<void>;
    recordRejected(
        actor: AdminMcpActor,
        operation: string,
        input: unknown,
        error: unknown,
    ): Promise<void>;
}
