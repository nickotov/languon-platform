import { useI18n } from '@/fsd/shared/i18n';
import { showToast } from '@/fsd/shared/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TextFolder } from '@languon/contracts';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import { useSessionStore } from '@/fsd/entities/session';

export async function loadLibraryFolders(
    requestWithSession: RequestWithTextSession,
    signal?: AbortSignal,
) {
    const folders: TextFolder[] = [];
    for (const lifecycle of ['active', 'archived'] as const) {
        let cursor: string | undefined;
        do {
            const page = await requestWithSession((token) =>
                textsApi.listFolders(
                    token,
                    { lifecycle, limit: 100, ...(cursor ? { cursor } : {}) },
                    signal,
                ),
            );
            folders.push(...page.data);
            cursor = page.nextCursor ?? undefined;
        } while (cursor);
    }

    return folders;
}

export function useTextLibrary(requestWithSession: RequestWithTextSession) {
    const userId = useSessionStore((state) => state.user?.id);
    const status = useSessionStore((state) => state.status);
    const client = useQueryClient();
    const { t } = useI18n();
    const query = useQuery({
        queryKey: ['texts', userId, 'folders'],
        queryFn: ({ signal }) => loadLibraryFolders(requestWithSession, signal),
        enabled: status === 'authenticated',
    });

    async function refresh() {
        await client.invalidateQueries({ queryKey: ['texts', userId] });
    }

    const restore = useMutation({
        mutationFn: (folder: TextFolder) =>
            requestWithSession((token) =>
                textsApi.restoreFolder(token, folder.id, {
                    expectedVersion: folder.version,
                }),
            ),
        onSuccess: async () => {
            await refresh();
            showToast({
                tone: 'success',
                content: `${t('texts.library.restored')}. ${t('texts.library.restoredHelp')}`,
                dismissLabel: t('profile.dismiss'),
            });
        },
    });

    return { ...query, folders: query.data ?? [], refresh, restore };
}
