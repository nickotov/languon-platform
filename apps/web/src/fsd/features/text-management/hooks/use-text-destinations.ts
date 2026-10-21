import { useQuery } from '@tanstack/react-query';
import type { TextFolder } from '@languon/contracts';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import { useSessionStore } from '@/fsd/entities/session';

export function useTextDestinations(request: RequestWithTextSession) {
    const actorId = useSessionStore((state) => state.user?.id);
    return useQuery({
        queryKey: ['texts', actorId, 'destinations'],
        queryFn: async ({ signal }) => {
            const folders: TextFolder[] = [];
            let cursor: string | undefined;
            do {
                const page = await request((token) =>
                    textsApi.listFolders(
                        token,
                        {
                            lifecycle: 'active',
                            limit: 100,
                            ...(cursor ? { cursor } : {}),
                        },
                        signal,
                    ),
                );
                folders.push(...page.data);
                cursor = page.nextCursor ?? undefined;
            } while (cursor);
            return folders;
        },
    });
}
