import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NavigationResourceKind } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { requestGuardedNavigation } from '@/fsd/shared/lib/navigation/guarded-navigation';
import { showToast } from '@/fsd/shared/ui';

export function useShellCreation(
    requestWithSession: RequestWithSession,
    openDictionary: () => void,
) {
    const { href, t } = useI18n();
    const router = useRouter();
    const [textOpen, setTextOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const operation = useRef(crypto.randomUUID());
    const ownerId = useSessionStore((state) => state.user?.id);
    useEffect(() => {
        setTextOpen(false);
        operation.current = crypto.randomUUID();
    }, [ownerId]);
    async function createKnowledge() {
        const owner = useSessionStore.getState().user?.id;
        if (!owner || creating) return;
        setCreating(true);
        try {
            const workspace = await requestWithSession((token) => {
                const state = useSessionStore.getState();
                if (
                    state.status !== 'authenticated' ||
                    state.user?.id !== owner
                )
                    throw new Error('Navigation session changed');
                return knowledgeApi.createDraft(token, operation.current);
            });
            if (useSessionStore.getState().user?.id !== owner) return;
            operation.current = crypto.randomUUID();
            router.push(href(`/knowledge/${workspace.noteId}`));
        } catch {
            if (useSessionStore.getState().user?.id === owner)
                showToast({
                    content: t('shell.createFailed'),
                    dismissLabel: t('profile.dismiss'),
                    tone: 'danger',
                });
        } finally {
            setCreating(false);
        }
    }
    function create(kind: NavigationResourceKind) {
        requestGuardedNavigation(() => {
            if (useSessionStore.getState().status !== 'authenticated') return;
            if (kind === 'dictionary') openDictionary();
            if (kind === 'text') setTextOpen(true);
            if (kind === 'knowledge') void createKnowledge();
        });
    }
    function closeText() {
        setTextOpen(false);
    }
    return { create, creating, textOpen, closeText };
}
