'use client';

import { useEffect, useState } from 'react';
import { Copy, Link2, Link2Off } from 'lucide-react';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import styles from './knowledge-detail-page.module.css';

type Share = Awaited<ReturnType<typeof knowledgeApi.share>>;

export function WorkspaceShareControls({
    noteId,
    enabled,
    onChange,
}: {
    noteId: string;
    enabled: boolean;
    onChange(enabled: boolean): void;
}) {
    const { href, t } = useI18n();
    const { requestWithSession } = useAuth();
    const [share, setShare] = useState<Share | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setShare(null);
            setCopied(false);
            return;
        }
        let active = true;
        void requestWithSession((token) => knowledgeApi.share(token, noteId))
            .then((result) => {
                if (active) setShare(result);
            })
            .catch(() => {
                if (active) setError(true);
            });
        return () => {
            active = false;
        };
    }, [enabled, noteId, requestWithSession]);

    async function enable() {
        setBusy(true);
        setError(false);
        try {
            const result = await requestWithSession((token) =>
                knowledgeApi.enableShare(token, noteId),
            );
            setShare(result);
            setCopied(false);
            onChange(true);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }

    async function disable() {
        setBusy(true);
        setError(false);
        try {
            await requestWithSession((token) =>
                knowledgeApi.disableShare(token, noteId),
            );
            setShare(null);
            setCopied(false);
            onChange(false);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (!share) return;
        const url = `${window.location.origin}${href(`/shared/knowledge/${share.locator}`)}#${share.key}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            setError(true);
        }
    }

    return (
        <div className={styles.shareControls}>
            {enabled ? (
                <>
                    <Button
                        variant='secondary'
                        leadingIcon={<Copy aria-hidden size={18} />}
                        disabled={busy || !share}
                        onClick={copy}
                    >
                        {t(
                            copied
                                ? 'knowledge.linkCopied'
                                : 'knowledge.copyLink',
                        )}
                    </Button>
                    <Button
                        variant='ghost'
                        leadingIcon={<Link2Off aria-hidden size={18} />}
                        loading={busy}
                        onClick={disable}
                    >
                        {t('knowledge.disableSharing')}
                    </Button>
                </>
            ) : (
                <Button
                    variant='secondary'
                    leadingIcon={<Link2 aria-hidden size={18} />}
                    loading={busy}
                    onClick={enable}
                >
                    {t('knowledge.enableSharing')}
                </Button>
            )}
            {error && (
                <InlineAlert tone='error'>
                    {t('knowledge.shareError')}
                </InlineAlert>
            )}
        </div>
    );
}
