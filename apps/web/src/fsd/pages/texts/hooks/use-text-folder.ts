import { useI18n } from '@/fsd/shared/i18n';
import { showToast } from '@/fsd/shared/ui';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import type { TextDocument } from '@languon/contracts';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import { useSessionStore } from '@/fsd/entities/session';

export function useTextFolder(
    folderId: string,
    lifecycle: 'active' | 'archived',
    requestWithSession: RequestWithTextSession,
    enabled: boolean,
) {
    const userId = useSessionStore((state) => state.user?.id);
    const client = useQueryClient();
    const { t } = useI18n();
    const query = useInfiniteQuery({
        queryKey: ['texts', userId, 'folder', folderId, lifecycle],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ signal, pageParam }) =>
            requestWithSession((token) =>
                textsApi.listTexts(
                    token,
                    folderId,
                    {
                        lifecycle,
                        limit: 25,
                        ...(pageParam ? { cursor: pageParam } : {}),
                    },
                    signal,
                ),
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        enabled,
    });
    async function refresh() {
        await client.invalidateQueries({ queryKey: ['texts', userId] });
    }
    const restore = useMutation({
        mutationFn: (document: TextDocument) =>
            requestWithSession((token) =>
                textsApi.restoreText(token, document.id, {
                    expectedVersion: document.version,
                }),
            ),
        onSuccess: async () => {
            await refresh();
            showToast({
                tone: 'success',
                content: `${t('texts.folder.restored')}. ${t('texts.library.restoredHelp')}`,
                dismissLabel: t('profile.dismiss'),
            });
        },
    });
    return {
        ...query,
        documents: query.data?.pages.flatMap((page) => page.data) ?? [],
        restore,
        refresh,
    };
}
