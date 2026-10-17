import { useQuery } from '@tanstack/react-query';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';

export function useTextWorkspaceData(
    folderId: string,
    textId: string | undefined,
    request: RequestWithTextSession,
    actorId: string,
) {
    const folder = useQuery({
        queryKey: ['texts-workspace-folder', actorId, folderId],
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
                const found = result.data.find((item) => item.id === folderId);
                if (found) return found;
                cursor = result.nextCursor ?? undefined;
            } while (cursor);
            return null;
        },
    });

    const remote = useQuery({
        queryKey: ['text', actorId, textId],
        queryFn: ({ signal }) =>
            request((token) => textsApi.getText(token, textId!, signal)),
        enabled: Boolean(textId),
        refetchOnWindowFocus: false,
    });

    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });

    return { folder, remote, languages };
}
