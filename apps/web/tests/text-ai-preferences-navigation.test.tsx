import { StrictMode, useEffect, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useModelPreferenceNavigation } from '@/fsd/pages/profile/hooks/use-model-preference-navigation';
import { useHistoryPositionTracking } from '@/fsd/shared/lib/navigation/history-position';
import { requestGuardedNavigation } from '@/fsd/shared/lib/navigation/guarded-navigation';

describe('unsaved model preference navigation', () => {
    it('guards programmatic palette actions and removes the guard on unmount', () => {
        const navigate = vi.fn();
        const { result, unmount } = renderHook(useModelPreferenceNavigation);
        act(() => result.current.setDirty(true));
        act(() => requestGuardedNavigation(navigate));
        expect(result.current.open).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
        act(() => result.current.keepEditing());
        expect(navigate).not.toHaveBeenCalled();
        act(() => requestGuardedNavigation(navigate));
        act(() => result.current.discard());
        expect(navigate).toHaveBeenCalledOnce();
        unmount();
        requestGuardedNavigation(navigate);
        expect(navigate).toHaveBeenCalledTimes(2);
    });
    it('keeps editing without navigation, then permits one deliberate discard', () => {
        const navigate = vi.fn();
        const { result } = renderHook(useModelPreferenceNavigation);
        act(() => result.current.setDirty(true));
        act(() => result.current.request(navigate));
        expect(result.current.open).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
        act(() => result.current.keepEditing());
        expect(result.current.dirty).toBe(true);
        expect(result.current.open).toBe(false);
        act(() => result.current.request(navigate));
        act(() => result.current.discard());
        expect(navigate).toHaveBeenCalledOnce();
        expect(result.current.dirty).toBe(false);
    });
    it('guards native document leave and releases it after deliberate discard', () => {
        const { result } = renderHook(useModelPreferenceNavigation);
        act(() => result.current.setDirty(true));
        const blocked = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(blocked);
        expect(blocked.defaultPrevented).toBe(true);
        act(() => result.current.request(vi.fn()));
        act(() => result.current.discard());
        const allowed = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(allowed);
        expect(allowed.defaultPrevented).toBe(false);
    });
});

// Real history traversal: the root dispatcher precedes the router listener;
// the per-page guard subscribes later and survives attempted routing unchanged.
describe('SPA traversal fallback without Navigation API', () => {
    it('restores Back before application unmount and replays only after discard', async () => {
        const { trackHistoryPositions } =
            await import('@/fsd/shared/lib/navigation/history-position');
        const stopTracking = trackHistoryPositions();
        window.history.pushState(
            { __NA: true, marker: 'previous' },
            '',
            '/navigation-origin',
        );
        window.history.pushState(
            { __NA: true, marker: 'profile' },
            '',
            '/profile',
        );
        const dispatcher = renderHook(useHistoryPositionTracking);
        const nextListener = vi.fn();
        window.addEventListener('popstate', nextListener);
        const { result, unmount } = renderHook(useModelPreferenceNavigation);
        act(() => result.current.setDirty(true));
        act(() => window.history.back());
        await waitFor(() => expect(result.current.open).toBe(true));
        expect(window.location.pathname).toBe('/profile');
        expect(nextListener).not.toHaveBeenCalled();
        expect(window.history.state.marker).toBe('profile');
        act(() => result.current.keepEditing());
        expect(result.current.dirty).toBe(true);
        expect(window.location.pathname).toBe('/profile');
        act(() => window.history.back());
        await waitFor(() => expect(result.current.open).toBe(true));
        act(() => result.current.discard());
        await waitFor(() =>
            expect(window.location.pathname).toBe('/navigation-origin'),
        );
        expect(nextListener).toHaveBeenCalledOnce();
        unmount();
        window.removeEventListener('popstate', nextListener);
        dispatcher.unmount();
        stopTracking();
    });
    it('restores a Forward traversal and a multi-step Back without sentinel entries', async () => {
        const { trackHistoryPositions, readHistoryPosition } =
            await import('@/fsd/shared/lib/navigation/history-position');
        const stopTracking = trackHistoryPositions();
        window.history.pushState({ __NA: true }, '', '/older');
        window.history.pushState({ __NA: true }, '', '/profile');
        window.history.pushState({ __NA: true }, '', '/newer');
        window.history.back();
        await waitFor(() => expect(window.location.pathname).toBe('/profile'));
        const length = window.history.length;
        const profilePosition = readHistoryPosition(window.history.state);
        const dispatcher = renderHook(useHistoryPositionTracking);
        const nextListener = vi.fn();
        window.addEventListener('popstate', nextListener);
        const { result, unmount } = renderHook(useModelPreferenceNavigation);
        act(() => result.current.setDirty(true));
        act(() => window.history.forward());
        await waitFor(() => expect(result.current.open).toBe(true));
        expect(window.location.pathname).toBe('/profile');
        expect(readHistoryPosition(window.history.state)).toBe(profilePosition);
        expect(nextListener).not.toHaveBeenCalled();
        expect(window.history.length).toBe(length);
        act(() => result.current.keepEditing());
        act(() => window.history.go(-2));
        await waitFor(() => expect(result.current.open).toBe(true));
        expect(window.location.pathname).toBe('/profile');
        expect(nextListener).not.toHaveBeenCalled();
        expect(window.history.length).toBe(length);
        act(() => result.current.discard());
        await waitFor(() =>
            expect(readHistoryPosition(window.history.state)).toBe(
                profilePosition! - 2,
            ),
        );
        expect(nextListener).toHaveBeenCalledOnce();
        unmount();
        window.removeEventListener('popstate', nextListener);
        dispatcher.unmount();
        stopTracking();
    });
    it('preserves Next metadata and only restores methods still owned by the tracker', async () => {
        const { trackHistoryPositions, readHistoryPosition } =
            await import('@/fsd/shared/lib/navigation/history-position');
        const originalPush = window.history.pushState;
        const originalReplace = window.history.replaceState;
        const length = window.history.length;
        const stopTracking = trackHistoryPositions();
        expect(window.history.length).toBe(length);
        const position = readHistoryPosition(window.history.state)!;
        window.history.pushState(
            { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['root'] },
            '',
            '/tracked',
        );
        expect(readHistoryPosition(window.history.state)).toBe(position + 1);
        window.history.replaceState(
            { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['updated'] },
            '',
            '/replaced',
        );
        expect(readHistoryPosition(window.history.state)).toBe(position + 1);
        expect(window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual([
            'updated',
        ]);
        const newerWrapper = vi.fn();
        window.history.pushState = newerWrapper;
        stopTracking();
        expect(window.history.pushState).toBe(newerWrapper);
        expect(window.history.replaceState).toBe(originalReplace);
        window.history.pushState = originalPush;
    });
    it('installs once after Strict Mode effects and cancels queued setup after unmount', async () => {
        const { useHistoryPositionTracking, readHistoryPosition } =
            await import('@/fsd/shared/lib/navigation/history-position');
        const originalPush = window.history.pushState;
        const originalReplace = window.history.replaceState;
        function Wrapper({ children }: { children: ReactNode }) {
            return <StrictMode>{children}</StrictMode>;
        }
        const mounted = renderHook(useHistoryPositionTracking, {
            wrapper: Wrapper,
        });
        await act(async () => {
            await Promise.resolve();
        });
        const position = readHistoryPosition(window.history.state)!;
        window.history.pushState({ __NA: true }, '', '/strict-tracked');
        expect(readHistoryPosition(window.history.state)).toBe(position + 1);
        mounted.unmount();
        expect(window.history.pushState).toBe(originalPush);
        expect(window.history.replaceState).toBe(originalReplace);
        const immediate = renderHook(useHistoryPositionTracking);
        immediate.unmount();
        await act(async () => {
            await Promise.resolve();
        });
        expect(window.history.pushState).toBe(originalPush);
        expect(window.history.replaceState).toBe(originalReplace);
    });
    it('installs the global dispatcher during layout before the router passive listener', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const router = vi.fn();
        function Root({ children }: { children: ReactNode }) {
            useHistoryPositionTracking();
            useEffect(() => {
                window.addEventListener('popstate', router);
                return () => window.removeEventListener('popstate', router);
            }, []);
            return children;
        }
        const mounted = renderHook(useModelPreferenceNavigation, {
            wrapper: Root,
        });
        const registrations = add.mock.calls.filter(
            (call) => call[0] === 'popstate',
        );
        expect(registrations).toHaveLength(2);
        expect(registrations[0]?.[1]).toHaveProperty(
            'name',
            'dispatchTraversalGuards',
        );
        expect(registrations[0]?.[2]).toBe(true);
        expect(registrations[1]?.[1]).toBe(router);
        mounted.unmount();
        add.mockRestore();
    });
});
