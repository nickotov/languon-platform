'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { KnowledgeApiError, knowledgeApi } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { SharedNoteLearning } from './shared-note-learning';
import type { WorkbookLearningShareAccess } from '@languon/contracts';
import styles from './shared-knowledge-page.module.css';

export function SharedKnowledgePage({ locator }: { locator: string }) {
    const { t, href } = useI18n();
    const { requestWithSession } = useAuth();
    const router = useRouter();
    const signedIn = useSessionStore(
        (state) => state.status === 'authenticated',
    );
    const [access, setAccess] = useState<{
        locator: string;
        key: string;
    } | null>(null);
    const key = access?.locator === locator ? access.key : null;
    const [copying, setCopying] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const operationId = useRef(crypto.randomUUID());
    const storageKey = `shared-knowledge-key:${locator}`;

    useEffect(() => {
        function readKey() {
            const fragment = window.location.hash.startsWith('#')
                ? window.location.hash.slice(1)
                : '';
            if (fragment) {
                try {
                    window.sessionStorage.setItem(storageKey, fragment);
                    window.history.replaceState(
                        window.history.state,
                        '',
                        `${window.location.pathname}${window.location.search}`,
                    );
                } catch {
                    // The current page can still read the link when storage is unavailable.
                }
                setAccess({ locator, key: fragment });
                return;
            }
            try {
                setAccess({
                    locator,
                    key: window.sessionStorage.getItem(storageKey) ?? '',
                });
            } catch {
                setAccess({ locator, key: '' });
            }
        }
        readKey();
        window.addEventListener('hashchange', readKey);
        return () => window.removeEventListener('hashchange', readKey);
    }, [locator, storageKey]);

    const shared = useQuery({
        queryKey: ['shared-knowledge', locator, key],
        queryFn: ({ signal }) => knowledgeApi.readShared(locator, key!, signal),
        enabled: Boolean(key),
        retry: false,
        staleTime: 0,
    });

    useEffect(() => {
        if (
            shared.error instanceof KnowledgeApiError &&
            [403, 404, 410].includes(shared.error.status)
        ) {
            try {
                window.sessionStorage.removeItem(storageKey);
            } catch {
                // Storage may be unavailable; the failed link remains unusable.
            }
        }
    }, [shared.error, storageKey]);

    async function copy() {
        if (!shared.data || !key) return;
        setCopying(true);
        setCopyError(false);
        try {
            const note = await requestWithSession((token) =>
                knowledgeApi.copyShared(
                    token,
                    locator,
                    key,
                    shared.data.version,
                    operationId.current,
                ),
            );
            try {
                window.sessionStorage.removeItem(storageKey);
            } catch {
                // The copied note is independent of the shared link.
            }
            router.push(href(`/knowledge/${note.id}`));
        } catch {
            setCopyError(true);
        } finally {
            setCopying(false);
        }
    }

    const learningAccess: WorkbookLearningShareAccess = {
        kind: 'note',
        locator,
        key: key ?? '',
    };
    const signInQuery = new URLSearchParams({
        returnTo: `/shared/knowledge/${locator}`,
    });
    const signInHref = href(`/login?${signInQuery}`);
    const copyAction = signedIn ? (
        <Button
            leadingIcon={<Copy aria-hidden size={18} />}
            loading={copying}
            onClick={copy}
        >
            {t('knowledge.copyShared')}
        </Button>
    ) : (
        <ButtonLink
            href={signInHref}
            leadingIcon={<Copy aria-hidden size={18} />}
        >
            {t('knowledge.signInToCopy')}
        </ButtonLink>
    );

    if (key === null || (key && shared.isPending))
        return (
            <main className={styles.page}>
                <LoadingState>{t('knowledge.loading')}</LoadingState>
            </main>
        );

    if (!key || !shared.data)
        return (
            <main className={styles.page}>
                <InlineAlert tone='error'>
                    {t('knowledge.sharedUnavailable')}
                </InlineAlert>
            </main>
        );

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}>
                        {t('knowledge.sharedNote')}
                    </p>
                    <h1 dir='auto'>{shared.data.title}</h1>
                    <p>{t('knowledge.sharedReadOnly')}</p>
                </div>
                {copyAction}
            </header>
            {copyError && (
                <InlineAlert tone='error'>
                    {t('knowledge.copySharedError')}
                </InlineAlert>
            )}
            <article className={styles.article}>
                <SharedNoteLearning
                    note={shared.data}
                    access={learningAccess}
                />
            </article>
        </main>
    );
}
