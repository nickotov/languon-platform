import {
    ApprovePortraitRequestSchema,
    DeletePortraitRequestSchema,
    DiscardPortraitInterviewRequestSchema,
    SavePortraitDraftRequestSchema,
    SetPortraitUseRequestSchema,
    PortraitStateSchema,
    type ApprovePortraitRequest,
    type DeletePortraitRequest,
    type DiscardPortraitInterviewRequest,
    type PortraitState,
    type SavePortraitDraftRequest,
    type SetPortraitUseRequest,
} from '@languon/contracts';
import {
    hasMeaningfulPortraitItems,
    portraitExpiry,
    validateReusablePortraitItems,
} from '../domain/portrait-policy';
import { summarizePortrait } from '../domain/portrait-summary';
import {
    PortraitConflictError,
    PortraitDraftUnavailableError,
    PortraitNotMeaningfulError,
    type PortraitStore,
    type PortraitStoreSession,
} from './ports/portrait-store';

export class PortraitService {
    public constructor(private readonly store: PortraitStore) {}

    public get(userId: string, at = new Date()): Promise<PortraitState> {
        return this.store.run(userId, (session) => this.current(session, at));
    }

    public saveDraft(
        userId: string,
        request: SavePortraitDraftRequest,
        at = new Date(),
    ): Promise<PortraitState> {
        const input = SavePortraitDraftRequestSchema.parse(request);
        const items = validateReusablePortraitItems(input.items);
        return this.store.run(userId, async (session) => {
            const current = await this.current(session, at);
            this.version(current, input.expectedVersion);
            // Explicitly supplying the latest approved version acknowledges conflict review.
            if (input.baseApprovedVersion !== current.approvedVersion)
                throw new PortraitConflictError();
            const next: PortraitState = {
                ...current,
                version: current.version + 1,
                draft: {
                    items,
                    locale: input.locale,
                    summary: summarizePortrait(items, input.locale),
                    updatedAt: at.toISOString(),
                    baseApprovedVersion: current.approvedVersion,
                    expiresAt: portraitExpiry(at),
                },
            };
            await session.touchInterview(at);
            await session.save(PortraitStateSchema.parse(next), at);
            return next;
        });
    }

    public approve(
        userId: string,
        request: ApprovePortraitRequest,
        at = new Date(),
    ): Promise<PortraitState> {
        const input = ApprovePortraitRequestSchema.parse(request);
        return this.store.run(userId, async (session) => {
            const current = await this.current(session, at);
            this.version(current, input.expectedVersion);
            if (input.expectedApprovedVersion !== current.approvedVersion)
                throw new PortraitConflictError();
            const draft = current.draft;
            if (!draft) throw new PortraitDraftUnavailableError();
            if (draft.baseApprovedVersion !== current.approvedVersion)
                throw new PortraitConflictError();
            const items = validateReusablePortraitItems(draft.items);
            if (!hasMeaningfulPortraitItems(items))
                throw new PortraitNotMeaningfulError();
            const next: PortraitState = {
                ...current,
                version: current.version + 1,
                approvedVersion: current.approvedVersion + 1,
                generation: current.generation + 1,
                approved: {
                    items,
                    locale: draft.locale,
                    summary: summarizePortrait(items, draft.locale),
                    updatedAt: at.toISOString(),
                },
                draft: null,
            };
            await session.clearInterview();
            await session.save(PortraitStateSchema.parse(next), at);
            return next;
        });
    }

    public setUse(
        userId: string,
        request: SetPortraitUseRequest,
        at = new Date(),
    ): Promise<PortraitState> {
        const input = SetPortraitUseRequestSchema.parse(request);
        return this.store.run(userId, async (session) => {
            const current = await this.current(session, at);
            this.version(current, input.expectedVersion);
            if (input.enabled && !current.approved)
                throw new PortraitNotMeaningfulError();
            const next = {
                ...current,
                version: current.version + 1,
                useEnabled: input.enabled,
            };
            await session.save(PortraitStateSchema.parse(next), at);
            return next;
        });
    }

    public delete(
        userId: string,
        request: DeletePortraitRequest,
        at = new Date(),
    ): Promise<PortraitState> {
        const input = DeletePortraitRequestSchema.parse(request);
        return this.store.run(userId, async (session) => {
            const current = await this.current(session, at);
            this.version(current, input.expectedVersion);
            const next: PortraitState = {
                version: current.version + 1,
                approvedVersion: current.approvedVersion + 1,
                generation: current.generation + 1,
                useEnabled: false,
                approved: null,
                draft: null,
            };
            await session.clearInterview();
            await session.save(PortraitStateSchema.parse(next), at);
            return next;
        });
    }

    public discardInterview(
        userId: string,
        request: DiscardPortraitInterviewRequest,
        at = new Date(),
    ): Promise<PortraitState> {
        const input = DiscardPortraitInterviewRequestSchema.parse(request);
        return this.store.run(userId, async (session) => {
            const current = await this.current(session, at);
            this.version(current, input.expectedVersion);
            const next: PortraitState = {
                ...current,
                version: current.version + 1,
                generation: current.generation + 1,
                draft: null,
            };
            await session.clearInterview();
            await session.save(PortraitStateSchema.parse(next), at);
            return next;
        });
    }

    private version(state: PortraitState, expected: number): void {
        if (state.version !== expected) throw new PortraitConflictError();
    }

    private async current(
        session: PortraitStoreSession,
        at: Date,
    ): Promise<PortraitState> {
        const state = await session.read();
        if (
            !state.draft ||
            new Date(state.draft.expiresAt).getTime() > at.getTime()
        )
            return state;
        const next = {
            ...state,
            version: state.version + 1,
            generation: state.generation + 1,
            draft: null,
        };
        await session.clearInterview();
        await session.save(PortraitStateSchema.parse(next), at);
        return next;
    }
}
