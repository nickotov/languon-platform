import { useQuery } from '@tanstack/react-query';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';

export function useTextWorkspaceData(
    folderId: string | null,
    textId: string | undefined,
    request: RequestWithTextSession,
    actorId: string,
) {
    const remote = useQuery({
        queryKey: ['text', actorId, textId],
        queryFn: ({ signal }) =>
            request((token) => textsApi.getText(token, textId!, signal)),
        enabled: Boolean(textId),
        refetchOnWindowFocus: false,
    });

    const pendingJob = useQuery({
        queryKey: ['texts-pending-job', actorId, textId],
        queryFn: ({ signal }) =>
            request((token) =>
                textsApi.getPendingAiJob(token, textId!, signal),
            ),
        enabled: Boolean(
            textId &&
            remote.isSuccess &&
            remote.data.text.lifecycle === 'active',
        ),
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    const membership = remote.data ? remote.data.text.folderId : folderId;
    const folder = useQuery({
        queryKey: ['texts-workspace-folder', actorId, membership],
        enabled: membership !== null,
        queryFn: async ({ signal }) => {
            let cursor: string | undefined;
            do {
                const result = await request((token) =>
                    textsApi.listFolders(
                        token,
                        { limit: 100, ...(cursor ? { cursor } : {}) },
                        signal,
                    ),
                );
                const found = result.data.find(
                    (item) => item.id === membership,
                );
                if (found) return found;
                cursor = result.nextCursor ?? undefined;
            } while (cursor);
            return null;
        },
    });

    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });

    return { folder, remote, languages, pendingJob };
}
