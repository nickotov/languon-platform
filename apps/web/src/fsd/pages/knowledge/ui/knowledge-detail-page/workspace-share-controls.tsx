'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    InlineAlert,
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '@/fsd/shared/ui';
import styles from './workspace-controls.module.css';

type Share = Awaited<ReturnType<typeof knowledgeApi.share>>;

export function WorkspaceShareControls({
    noteId,
    enabled,
    dirty,
    onChange,
    open,
    onOpenChange: notifyOpenChange,
    anchor,
}: {
    noteId: string;
    enabled: boolean;
    dirty: boolean;
    onChange(enabled: boolean): void;
    open: boolean;
    onOpenChange(open: boolean): void;
    anchor: ReactNode;
}) {
    const { href, t } = useI18n();
    const { requestWithSession } = useAuth();
    const panel = useRef<HTMLDivElement>(null);
    const [share, setShare] = useState<Share | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmDisable, setConfirmDisable] = useState(false);
    const url =
        share && typeof window !== 'undefined'
            ? `${window.location.origin}${href(`/shared/knowledge/${share.locator}`)}#${share.key}`
            : '';

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
        panel.current?.focus({ preventScroll: true });
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
        panel.current?.focus({ preventScroll: true });
        setBusy(true);
        setError(false);
        try {
            await requestWithSession((token) =>
                knowledgeApi.disableShare(token, noteId),
            );
            setShare(null);
            setCopied(false);
            setConfirmDisable(false);
            onChange(false);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            setError(true);
        }
    }

    function beginDisable() {
        panel.current?.focus({ preventScroll: true });
        setConfirmDisable(true);
    }
    function keepSharing() {
        panel.current?.focus({ preventScroll: true });
        setConfirmDisable(false);
    }
    function onOpenChange(open: boolean) {
        if (!open) setConfirmDisable(false);
        notifyOpenChange(open);
    }

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverAnchor asChild>{anchor}</PopoverAnchor>
            <PopoverContent
                ref={panel}
                align='end'
                className={styles.sharePanel}
                aria-label={t('knowledge.readOnlyLink')}
            >
                <strong>{t('knowledge.readOnlyLink')}</strong>
                <p>{t('knowledge.sharePrivacy')}</p>
                {enabled ? (
                    <>
                        <div className={styles.shareLink}>
                            <span className={styles.shareUrl}>{url}</span>
                            <Button
                                size='compact'
                                variant='ghost'
                                className={styles.copyButton}
                                leadingIcon={
                                    copied ? (
                                        <Check size={14} aria-hidden />
                                    ) : (
                                        <Copy size={14} aria-hidden />
                                    )
                                }
                                disabled={busy || !share}
                                onClick={copy}
                            >
                                {t(
                                    copied
                                        ? 'knowledge.linkCopied'
                                        : 'knowledge.copyLink',
                                )}
                            </Button>
                        </div>
                        {dirty && (
                            <p className={styles.warning}>
                                {t('knowledge.shareUnsaved')}
                            </p>
                        )}
                        <div className={styles.shareFooter}>
                            {confirmDisable ? (
                                <div className={styles.confirmActions}>
                                    <Button
                                        size='compact'
                                        variant='danger'
                                        loading={busy}
                                        onClick={disable}
                                    >
                                        {t('knowledge.confirmDisable')}
                                    </Button>
                                    <Button
                                        size='compact'
                                        variant='ghost'
                                        disabled={busy}
                                        onClick={keepSharing}
                                    >
                                        {t('knowledge.keepSharing')}
                                    </Button>
                                </div>
                            ) : (
                                <button
                                    type='button'
                                    className={styles.disable}
                                    disabled={busy}
                                    onClick={beginDisable}
                                >
                                    {t('knowledge.disableSharing')}
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <Button
                        size='compact'
                        variant='secondary'
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
            </PopoverContent>
        </Popover>
    );
}
