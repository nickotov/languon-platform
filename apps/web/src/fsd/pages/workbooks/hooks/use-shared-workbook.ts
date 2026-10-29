import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { workbookApi, WorkbookApiError } from '@/fsd/features/workbooks';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function useSharedWorkbook(locator: string) {
    const { requestWithSession } = useAuth();
    const { href } = useI18n();
    const router = useRouter();
    const [access, setAccess] = useState<{
        locator: string;
        key: string;
    } | null>(null);
    const key = access?.locator === locator ? access.key : null;
    const storageKey = `shared-workbook-key:${locator}`;
    const [copying, setCopying] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const operation = useRef(crypto.randomUUID());
    useEffect(() => {
        function readKey() {
            const fragment = window.location.hash.slice(1);
            let value = fragment;
            try {
                if (fragment)
                    window.sessionStorage.setItem(storageKey, fragment);
                else value = window.sessionStorage.getItem(storageKey) ?? '';
            } catch {
                /* Current fragment still works without session storage. */
            }
            if (fragment)
                window.history.replaceState(
                    window.history.state,
                    '',
                    `${window.location.pathname}${window.location.search}`,
                );
            setAccess({ locator, key: value });
        }
        readKey();
        window.addEventListener('hashchange', readKey);
        return () => window.removeEventListener('hashchange', readKey);
    }, [locator, storageKey]);
    const query = useQuery({
        queryKey: ['shared-workbook', locator, key],
        queryFn: ({ signal }) => workbookApi.readShared(locator, key!, signal),
        enabled: Boolean(key),
        retry: false,
        staleTime: 0,
        gcTime: 0,
    });
    useEffect(() => {
        if (
            query.error instanceof WorkbookApiError &&
            [403, 404, 410].includes(query.error.status)
        ) {
            try {
                window.sessionStorage.removeItem(storageKey);
            } catch {
                /* Revoked source remains inaccessible. */
            }
        }
    }, [query.error, storageKey]);
    async function copy() {
        if (!query.data || !key || copying) return;
        setCopying(true);
        setCopyError(false);
        try {
            const result = await requestWithSession((token) =>
                workbookApi.copyShared(token, locator, key, {
                    id: operation.current,
                    title: query.data.workbook.title,
                }),
            );
            router.push(href(`/workbooks/${result.workbook.id}`));
        } catch {
            setCopyError(true);
        } finally {
            setCopying(false);
        }
    }
    return { key, query, copying, copyError, copy };
}
