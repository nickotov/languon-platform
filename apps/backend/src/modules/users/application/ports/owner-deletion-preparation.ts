/** Best-effort prompt cancellation; the purge worker rechecks durable terminal state. */
export interface OwnerDeletionPreparation {
    requestCancellation(userId: string): Promise<void>;
}
