import { useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { workbookApi } from '@/fsd/features/workbooks';
import { useI18n } from '@/fsd/shared/i18n';

export function useWorkbookDetail(id: string) {
    const { requestWithSession } = useAuth();
    const actorId = useSessionStore((state) => state.user?.id);
    const { href } = useI18n();
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [shareLink, setShareLink] = useState('');
    const copyInput = useRef<{
        id: string;
        title: string;
        expectedVersion: number;
    } | null>(null);
    const query = useQuery({
        queryKey: ['workbook', actorId, id],
        queryFn: ({ signal }) =>
            requestWithSession((token) => workbookApi.get(token, id, signal)),
        retry: false,
        gcTime: 0,
    });
    const library = useInfiniteQuery({
        queryKey: ['workbook-available-notes', actorId],
        initialPageParam: 0,
        queryFn: ({ signal, pageParam }) =>
            requestWithSession((token) =>
                knowledgeApi.listWorkspaces(
                    token,
                    { offset: pageParam, limit: 100 },
                    signal,
                ),
            ),
        getNextPageParam: (page) =>
            page.offset + page.workspaces.length < page.total
                ? page.offset + page.workspaces.length
                : undefined,
        retry: false,
        gcTime: 0,
    });
    const workbook = query.data?.workbook;
    async function mutate(action: (token: string) => Promise<unknown>) {
        if (busy) return false;
        setBusy(true);
        setError(false);
        try {
            await requestWithSession(action);
            await query.refetch();
            return true;
        } catch {
            setError(true);
            await query.refetch();
            return false;
        } finally {
            setBusy(false);
        }
    }
    async function rename(title: string) {
        if (workbook)
            await mutate((token) =>
                workbookApi.rename(token, id, {
                    title,
                    expectedVersion: workbook.version,
                }),
            );
    }
    async function setNotes(
        noteIds: string[],
        acknowledgeSharedAddition = false,
    ) {
        if (!workbook) return false;
        return mutate((token) =>
            workbookApi.setNotes(token, id, {
                noteIds,
                acknowledgeSharedAddition,
                expectedVersion: workbook.version,
            }),
        );
    }
    async function remove() {
        if (!workbook) return;
        const done = await mutate((token) =>
            workbookApi.remove(token, id, workbook.version),
        );
        if (done) router.push(href('/workbooks'));
    }
    async function share() {
        if (!workbook) return;
        await mutate(async (token) => {
            const access = await workbookApi.share(token, id, workbook.version);
            setShareLink(
                `${window.location.origin}${href(`/shared/workbooks/${access.locator}`)}#${access.key}`,
            );
        });
    }
    async function copy() {
        if (
            !workbook ||
            busy ||
            workbook.notes.some((note) => note.status !== 'saved')
        )
            return;
        const input = copyInput.current ?? {
            id: crypto.randomUUID(),
            title: workbook.title,
            expectedVersion: workbook.version,
        };
        copyInput.current = input;
        await mutate(async (token) => {
            const result = await workbookApi.copy(token, id, input);
            router.push(href(`/workbooks/${result.workbook.id}`));
        });
    }
    async function revoke() {
        if (!workbook) return;
        const done = await mutate((token) =>
            workbookApi.revoke(token, id, workbook.version),
        );
        if (done) setShareLink('');
    }
    return {
        query,
        library,
        workbook,
        busy,
        error,
        shareLink,
        rename,
        setNotes,
        remove,
        share,
        revoke,
        copy,
    };
}
