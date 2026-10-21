import type { PortraitState } from '@languon/contracts';

export interface PortraitStoreSession {
    /** Current row or zero state. Serialized by the active account lock. */
    read(): Promise<PortraitState>;
    save(state: PortraitState, at: Date): Promise<void>;
    /** Removes transcripts, working state and pending outputs in the same transaction. */
    clearInterview(): Promise<void>;
    /** Refreshes an existing interview only for explicit learner edits. */
    touchInterview(at: Date): Promise<void>;
}
export interface PortraitStore {
    /** Locks the active account, rejects deleted/inactive users, serializes all portrait/interview writes. */
    run<T>(
        userId: string,
        work: (session: PortraitStoreSession) => Promise<T>,
    ): Promise<T>;
}
export * from '../../domain/errors';
export const emptyPortraitState = (): PortraitState => ({
    version: 0,
    approvedVersion: 0,
    generation: 0,
    useEnabled: false,
    approved: null,
    draft: null,
});
