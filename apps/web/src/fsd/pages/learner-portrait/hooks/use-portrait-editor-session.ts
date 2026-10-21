'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    PortraitItemsSchema,
    type PortraitItems,
    type PortraitLocaleSchema,
    type PortraitState,
} from '@languon/contracts';
import type { z } from 'zod';
import {
    PortraitApiError,
    portraitApi,
    setPortraitStateCache,
} from '@/fsd/entities/learner-portrait';
import {
    emptyPortraitItems,
    hasMeaningfulPortraitItems,
} from '@/fsd/features/portrait-editor';
import { useSessionStore } from '@/fsd/entities/session';
import type { PortraitManagement } from './use-portrait-management';

export function usePortraitEditorSession(
    management: PortraitManagement,
    review: boolean,
) {
    const router = useRouter();
    const initial = management.query.data!;
    const initialItems = review
        ? (initial.draft?.items ?? initial.approved?.items)
        : initial.approved?.items;
    const [items, setItems] = useState<PortraitItems>(() =>
        structuredClone(initialItems ?? emptyPortraitItems()),
    );
    const [base, setBase] = useState(initial);
    const [latest, setLatest] = useState<PortraitState | null>(() => {
        if (
            review &&
            initial.draft &&
            initial.draft.baseApprovedVersion !== initial.approvedVersion
        )
            return initial;
        return null;
    });
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(false);
    const [errorReason, setErrorReason] = useState<
        'invalid' | 'resource' | 'generic'
    >('generic');
    const current = management.query.data!;
    const externalConflict = current.approvedVersion > base.approvedVersion;
    const conflict = latest ?? (externalConflict ? current : null);
    const valid = PortraitItemsSchema.safeParse(items).success;
    const meaningful = hasMeaningfulPortraitItems(items);
    const unchanged = Boolean(
        initial.approved &&
        JSON.stringify(items) === JSON.stringify(initial.approved.items),
    );

    function reconcile(next: PortraitItems) {
        setItems(next);
        setBase(conflict ?? current);
        setLatest(null);
        setError(false);
    }

    async function save(locale: z.infer<typeof PortraitLocaleSchema>) {
        if (pending || conflict || !valid || !meaningful || !management.ownerId)
            return;
        setPending(true);
        setError(false);
        let savedDraft: PortraitState | null = null;
        try {
            savedDraft = await management.requestWithSession((token) =>
                portraitApi.saveDraft(token, {
                    expectedVersion: base.version,
                    baseApprovedVersion: base.approvedVersion,
                    items,
                    locale,
                }),
            );
            if (useSessionStore.getState().user?.id !== management.ownerId)
                return;
            setBase(savedDraft);
            setPortraitStateCache(
                management.client,
                management.ownerId,
                savedDraft,
            );
            const approved = await management.requestWithSession((token) =>
                portraitApi.approve(token, {
                    expectedVersion: savedDraft!.version,
                    expectedApprovedVersion: savedDraft!.approvedVersion,
                }),
            );
            if (useSessionStore.getState().user?.id !== management.ownerId)
                return;
            setPortraitStateCache(
                management.client,
                management.ownerId,
                approved,
            );
            await Promise.all([
                management.client.invalidateQueries({
                    queryKey: [
                        'learner-portrait-interview-status',
                        management.ownerId,
                    ],
                }),
                management.client.invalidateQueries({
                    queryKey: ['conversations', management.ownerId],
                }),
                management.client.invalidateQueries({
                    queryKey: ['conversation', management.ownerId],
                }),
            ]);
            router.push(
                `/portrait?saved=${initial.approved ? 'update' : 'first'}`,
            );
        } catch (cause) {
            setError(true);
            let reason: 'invalid' | 'resource' | 'generic' = 'generic';
            if (
                cause instanceof PortraitApiError &&
                cause.code === 'invalid_request'
            )
                reason = 'invalid';
            if (
                cause instanceof PortraitApiError &&
                cause.code === 'resource_limit'
            )
                reason = 'resource';
            setErrorReason(reason);
            if (
                cause instanceof PortraitApiError &&
                cause.code === 'version_conflict'
            ) {
                try {
                    const refreshed = await management.requestWithSession(
                        (token) => portraitApi.read(token),
                    );
                    setPortraitStateCache(
                        management.client,
                        management.ownerId,
                        refreshed,
                    );
                    setLatest(refreshed);
                } catch {
                    /* Retain all local edits until retry succeeds. */
                }
            }
        } finally {
            setPending(false);
        }
    }
    return {
        items,
        setItems,
        base,
        conflict,
        reconcile,
        pending,
        error,
        errorReason,
        save,
        valid,
        meaningful,
        unchanged,
    };
}
