import { describe, expect, it } from 'vitest';
import { PortraitItemsSchema } from '@languon/contracts';
import { PortraitService } from './portrait-service';
import {
    emptyPortraitState,
    PortraitConflictError,
    PortraitNotMeaningfulError,
    type PortraitStore,
} from './ports/portrait-store';
function fixture() {
    let state = emptyPortraitState();
    let clears = 0;
    const store: PortraitStore = {
        run: async (_userId, work) =>
            work({
                read: async () => structuredClone(state),
                touchInterview: async () => {},
                save: async (next) => {
                    state = structuredClone(next);
                },
                clearInterview: async () => {
                    clears++;
                },
            }),
    };
    return {
        service: new PortraitService(store),
        state: () => state,
        clears: () => clears,
    };
}
const at = new Date('2026-10-20T12:00:00Z');
const items = PortraitItemsSchema.parse({
    goals: ['Travel'],
    tone: 'friendly',
});
const draftRequest = {
    expectedVersion: 0,
    baseApprovedVersion: 0,
    items,
    locale: 'en' as const,
};

describe('portrait approval and use', () => {
    it('saves partial drafts and approval without enabling; later updates preserve explicit use', async () => {
        const f = fixture();
        const draft = await f.service.saveDraft('user', draftRequest, at);
        expect(draft.approved).toBeNull();
        let state = await f.service.approve(
            'user',
            { expectedVersion: 1, expectedApprovedVersion: 0 },
            at,
        );
        expect(state.useEnabled).toBe(false);
        expect(state.approved?.summary).toContain('Travel');
        expect(state.draft).toBeNull();
        await f.service.setUse(
            'user',
            { expectedVersion: 2, enabled: true },
            at,
        );
        await f.service.saveDraft(
            'user',
            { ...draftRequest, expectedVersion: 3, baseApprovedVersion: 1 },
            at,
        );
        state = await f.service.approve(
            'user',
            { expectedVersion: 4, expectedApprovedVersion: 1 },
            at,
        );
        expect(state.useEnabled).toBe(true);
        expect(f.clears()).toBe(2);
    });
    it('rejects stale writes and empty approval without modifying the approved state', async () => {
        const f = fixture();
        await f.service.saveDraft(
            'user',
            { ...draftRequest, items: PortraitItemsSchema.parse({}) },
            at,
        );
        await expect(
            f.service.saveDraft('user', draftRequest, at),
        ).rejects.toBeInstanceOf(PortraitConflictError);
        await expect(
            f.service.approve(
                'user',
                { expectedVersion: 1, expectedApprovedVersion: 0 },
                at,
            ),
        ).rejects.toBeInstanceOf(PortraitNotMeaningfulError);
        expect(f.state().approved).toBeNull();
    });
    it('expires draft without touching approved state or refreshing activity on a read', async () => {
        const f = fixture();
        await f.service.saveDraft('user', draftRequest, at);
        await f.service.approve(
            'user',
            { expectedVersion: 1, expectedApprovedVersion: 0 },
            at,
        );
        const before = await f.service.saveDraft(
            'user',
            { ...draftRequest, expectedVersion: 2, baseApprovedVersion: 1 },
            at,
        );
        const after = await f.service.get(
            'user',
            new Date('2026-11-03T12:00:00Z'),
        );
        expect(after.draft).toBeNull();
        expect(after.approved).toEqual(before.approved);
        expect(after.generation).toBe(before.generation + 1);
    });
    it('deletion disables use and fences pending writes with a persistent generation', async () => {
        const f = fixture();
        const draft = await f.service.saveDraft('user', draftRequest, at);
        const deleted = await f.service.delete(
            'user',
            { expectedVersion: draft.version, confirmed: true },
            at,
        );
        expect(deleted).toMatchObject({
            approved: null,
            draft: null,
            useEnabled: false,
            generation: 1,
            approvedVersion: 1,
        });
        await expect(
            f.service.saveDraft(
                'user',
                { ...draftRequest, expectedVersion: deleted.version },
                at,
            ),
        ).rejects.toBeInstanceOf(PortraitConflictError);
    });
    it('discard removes unfinished state and fences output while preserving approved portrait and use', async () => {
        const f = fixture();
        await f.service.saveDraft('user', draftRequest, at);
        await f.service.approve(
            'user',
            { expectedVersion: 1, expectedApprovedVersion: 0 },
            at,
        );
        await f.service.setUse(
            'user',
            { expectedVersion: 2, enabled: true },
            at,
        );
        const before = await f.service.saveDraft(
            'user',
            { ...draftRequest, expectedVersion: 3, baseApprovedVersion: 1 },
            at,
        );
        const after = await f.service.discardInterview(
            'user',
            { expectedVersion: 4 },
            at,
        );
        expect(after.draft).toBeNull();
        expect(after.approved).toEqual(before.approved);
        expect(after.useEnabled).toBe(true);
        expect(after.generation).toBe(before.generation + 1);
    });
});
