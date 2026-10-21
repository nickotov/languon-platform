import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type {
    AuthUser,
    PortraitItems,
    PortraitState,
} from '@languon/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { portraitApi, PortraitApiError } from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';
import { usePortraitEditorSession } from '@/fsd/pages/learner-portrait/hooks/use-portrait-editor-session';
import type { PortraitManagement } from '@/fsd/pages/learner-portrait/hooks/use-portrait-management';
import {
    changedPortraitFields,
    reconcilePortraitItems,
} from '@/fsd/pages/learner-portrait/lib/reconciliation';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const ownerId = '10000000-0000-4000-8000-000000000001';
const empty: PortraitItems = {
    languages: [],
    explanationLanguages: [],
    goals: [],
    accommodations: [],
    hobbies: [],
};
function state(version = 0): PortraitState {
    return {
        version,
        approvedVersion: 0,
        generation: 0,
        useEnabled: false,
        approved: null,
        draft: null,
    };
}
function management(initial = state()): PortraitManagement {
    return {
        ownerId,
        query: { data: initial },
        client: new QueryClient({
            defaultOptions: { queries: { retry: false } },
        }),
        requestWithSession: <T,>(operation: (token: string) => Promise<T>) =>
            operation('fixture-token'),
    } as unknown as PortraitManagement;
}
function approved(version = 4): PortraitState {
    return {
        ...state(version),
        approvedVersion: 2,
        approved: {
            items: { ...empty, goals: ['Travel'] },
            locale: 'en',
            summary: 'You learn for travel.',
            updatedAt: '2026-10-21T10:00:00.000Z',
        },
    };
}
beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ user: { id: ownerId } as AuthUser });
});

describe('portrait manual approval workflow', () => {
    it('does not save an empty portrait', async () => {
        const save = vi.spyOn(portraitApi, 'saveDraft');
        const { result } = renderHook(() =>
            usePortraitEditorSession(management(), false),
        );
        await act(() => result.current.save('en'));
        expect(save).not.toHaveBeenCalled();
    });

    it('explicit Save writes confirmed items and approves without enabling or AI work', async () => {
        const save = vi
            .spyOn(portraitApi, 'saveDraft')
            .mockResolvedValue({
                ...state(1),
                draft: {
                    items: { ...empty, goals: ['Travel'] },
                    locale: 'fr',
                    summary: 'Résumé',
                    baseApprovedVersion: 0,
                    updatedAt: '2026-10-21T10:00:00.000Z',
                    expiresAt: '2026-11-04T10:00:00.000Z',
                },
            });
        const approve = vi
            .spyOn(portraitApi, 'approve')
            .mockResolvedValue({ ...approved(2), useEnabled: false });
        const use = vi.spyOn(portraitApi, 'setUse');
        const interview = vi.spyOn(portraitApi, 'submitInterview');
        const context = management();
        const { result } = renderHook(() =>
            usePortraitEditorSession(context, false),
        );
        act(() => result.current.setItems({ ...empty, goals: ['Travel'] }));
        await act(() => result.current.save('fr'));
        expect(save).toHaveBeenCalledWith(
            'fixture-token',
            expect.objectContaining({
                expectedVersion: 0,
                baseApprovedVersion: 0,
                locale: 'fr',
                items: expect.objectContaining({ goals: ['Travel'] }),
            }),
        );
        expect(approve).toHaveBeenCalledWith('fixture-token', {
            expectedVersion: 1,
            expectedApprovedVersion: 0,
        });
        expect(use).not.toHaveBeenCalled();
        expect(interview).not.toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith('/portrait?saved=first');
    });

    it('retains local edits on conflict and needs explicit reconciliation before retry', async () => {
        vi.spyOn(portraitApi, 'saveDraft').mockRejectedValue(
            new PortraitApiError(409, {
                code: 'version_conflict',
                message: 'Conflict',
                correlationId: 'fixture',
            }),
        );
        const latest = approved();
        vi.spyOn(portraitApi, 'read').mockResolvedValue(latest);
        const context = management();
        const { result } = renderHook(() =>
            usePortraitEditorSession(context, false),
        );
        act(() =>
            result.current.setItems({
                ...empty,
                accommodations: ['Short steps'],
            }),
        );
        await act(() => result.current.save('en'));
        expect(result.current.items.accommodations).toEqual(['Short steps']);
        expect(result.current.conflict?.approvedVersion).toBe(2);
        await act(() => result.current.save('en'));
        expect(portraitApi.saveDraft).toHaveBeenCalledTimes(1);
        act(() =>
            result.current.reconcile({
                ...latest.approved!.items,
                accommodations: ['Short steps'],
            }),
        );
        expect(result.current.base.version).toBe(4);
        expect(result.current.conflict).toBeNull();
    });

    it('does not approve with a different account after an in-flight draft save', async () => {
        let finish!: (next: PortraitState) => void;
        vi.spyOn(portraitApi, 'saveDraft').mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const approve = vi.spyOn(portraitApi, 'approve');
        const context = management();
        const { result } = renderHook(() =>
            usePortraitEditorSession(context, false),
        );
        act(() => result.current.setItems({ ...empty, goals: ['Work'] }));
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.save('en');
        });
        useSessionStore.setState({ user: { id: 'another-owner' } as AuthUser });
        await act(async () => {
            finish(state(1));
            await pending;
        });
        expect(approve).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
    });

    it('detects newer approved versions without replacing unsaved form values', () => {
        const { result, rerender } = renderHook(
            ({ context }) => usePortraitEditorSession(context, false),
            { initialProps: { context: management() } },
        );
        act(() =>
            result.current.setItems({ ...empty, goals: ['Personal goal'] }),
        );
        rerender({ context: management(approved()) });
        expect(result.current.conflict?.version).toBe(4);
        expect(result.current.items.goals).toEqual(['Personal goal']);
    });
});

describe('portrait field reconciliation', () => {
    it('requires a choice for every changed field and supports explicitly removing an optional field', () => {
        const latest = { ...empty, goals: ['Work'] };
        const draft = { ...empty, goals: ['Travel'], tone: 'formal' as const };
        expect(changedPortraitFields(latest, draft)).toEqual(['goals', 'tone']);
        expect(
            reconcilePortraitItems(latest, draft, { goals: 'draft' }),
        ).toBeNull();
        expect(
            reconcilePortraitItems(latest, draft, {
                goals: 'draft',
                tone: 'saved',
            }),
        ).toEqual({ ...empty, goals: ['Travel'] });
        expect(draft.tone).toBe('formal');
    });
});
