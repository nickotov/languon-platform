import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { TextShareKeySchema } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import { useSessionStore } from '@/fsd/entities/session';

export function useSharedText(kind: 'text' | 'folder', shareId: string) {
    const locator = `${kind}:${shareId}`;
    const userId = useSessionStore((state) => state.user?.id);
    const [capability, setCapability] = useState<{
        key: string;
        epoch: string;
        locator: string;
    } | null>(null);
    useEffect(() => {
        function update() {
            const parsed = TextShareKeySchema.safeParse(
                window.location.hash.slice(1),
            );
            setCapability({
                key: parsed.success ? parsed.data : '',
                locator,
                epoch: crypto.randomUUID(),
            });
        }
        update();
        window.addEventListener('hashchange', update);
        return () => window.removeEventListener('hashchange', update);
    }, [kind, shareId, locator]);
    const key = capability?.locator === locator ? capability.key : '';
    const query = useInfiniteQuery({
        queryKey: ['shared-texts', kind, shareId, capability?.epoch, userId],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) => {
            const options = {
                limit: 100,
                ...(pageParam ? { cursor: pageParam } : {}),
            };
            return kind === 'text'
                ? textsApi.readSharedText(shareId, key, options, signal)
                : textsApi.readSharedFolder(shareId, key, options, signal);
        },
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        enabled: Boolean(key),
        retry: false,
        staleTime: 0,
        gcTime: 0,
    });
    return {
        ...query,
        shareKey: key,
        initializing: capability === null,
        folder: query.data?.pages[0]?.folder ?? null,
        texts: query.data?.pages.flatMap((page) => page.texts) ?? [],
    };
}
