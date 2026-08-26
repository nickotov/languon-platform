'use client';

import type { OwnedDictionary } from '@languon/contracts';
import { useState } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import { Button, Card, InlineAlert } from '@/fsd/shared/ui';

import styles from './dictionary-sharing.module.css';

export function DictionarySharing({
    dictionary,
    onRevoke,
    onRotate,
    pending,
}: {
    dictionary: OwnedDictionary;
    onRevoke(): Promise<void>;
    onRotate(): Promise<{ shareId: string; shareKey: string }>;
    pending: boolean;
}) {
    const { t } = useI18n();
    const [capability, setCapability] = useState<{
        shareId: string;
        shareKey: string;
    } | null>(null);
    const [outcome, setOutcome] = useState('');

    async function rotate() {
        try {
            const next = await onRotate();
            setCapability(next);
            setOutcome(t('dictionary.share.rotated'));
        } catch {
            // The owning mutation renders the recoverable error state.
        }
    }
    async function copy() {
        if (!capability) return;
        const url = `${window.location.origin}/shared/dictionaries/${capability.shareId}#${capability.shareKey}`;
        try {
            await navigator.clipboard.writeText(url);
            setOutcome(t('dictionary.share.copied'));
        } catch {
            setOutcome(t('dictionary.share.copyFailed'));
        }
    }
    async function revoke() {
        try {
            await onRevoke();
            setCapability(null);
            setOutcome(t('dictionary.share.revoked'));
        } catch {
            // The owning mutation renders the recoverable error state.
        }
    }

    return (
        <Card className={styles.card}>
            <h2>{t('dictionary.share.title')}</h2>
            <p>{t('dictionary.share.help')}</p>
            <InlineAlert
                tone={dictionary.visibility === 'unlisted' ? 'warning' : 'info'}
            >
                {dictionary.visibility === 'unlisted'
                    ? t('dictionary.share.unlistedStatus')
                    : t('dictionary.share.privateStatus')}
            </InlineAlert>
            {capability ? (
                <div className={styles.capability}>
                    <p>{t('dictionary.share.once')}</p>
                    <Button
                        onClick={() => void copy()}
                        type='button'
                        variant='secondary'
                    >
                        {t('dictionary.share.copy')}
                    </Button>
                </div>
            ) : null}
            <p aria-live='polite' className={styles.outcome}>
                {outcome}
            </p>
            <div className={styles.actions}>
                <Button
                    loading={pending}
                    onClick={() => void rotate()}
                    type='button'
                >
                    {dictionary.visibility === 'unlisted'
                        ? t('dictionary.share.rotate')
                        : t('dictionary.share.publish')}
                </Button>
                {dictionary.visibility === 'unlisted' ? (
                    <Button
                        disabled={pending}
                        onClick={() => void revoke()}
                        type='button'
                        variant='danger'
                    >
                        {t('dictionary.share.revoke')}
                    </Button>
                ) : null}
            </div>
        </Card>
    );
}
