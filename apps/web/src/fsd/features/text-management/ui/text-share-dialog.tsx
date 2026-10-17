'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
    CheckIcon,
    CopyIcon,
    ExternalLinkIcon,
    GlobeIcon,
    Link2Icon,
    RefreshCwIcon,
} from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    Input,
} from '@/fsd/shared/ui';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import { useTextShare } from '../hooks/use-text-share';
import type { TextResource } from '../types';
import styles from './dialogs.module.css';

type Props = {
    open: boolean;
    kind: 'text' | 'folder';
    resource: TextResource;
    requestWithSession: RequestWithTextSession;
    onClose(): void;
    onChanged?(): void;
};

export function TextShareDialog(props: Props) {
    return props.open ? (
        <ShareContent key={`${props.kind}:${props.resource.id}`} {...props} />
    ) : null;
}

function ShareContent({
    kind,
    resource,
    requestWithSession,
    onClose,
    onChanged,
}: Props) {
    const { t } = useI18n();
    const share = useTextShare(kind, resource, requestWithSession, onChanged);
    const field = useRef<HTMLInputElement>(null);
    const [copyError, setCopyError] = useState(false);
    const name = 'name' in resource ? resource.name : resource.title;

    function confirmRevoke() {
        share.setStep('confirm');
    }

    function keepLink() {
        share.setStep('normal');
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(share.url);
            share.setCopied(true);
            setCopyError(false);
        } catch {
            field.current?.select();
            setCopyError(true);
        }
    }

    return (
        <Dialog
            open
            onClose={onClose}
            dismissible={!share.busy}
            title={t(
                kind === 'folder'
                    ? 'texts.manage.shareFolder'
                    : 'texts.manage.shareText',
            )}
            description={name}
            footer={
                <DialogActions align='between'>
                    {share.active ? (
                        <Button
                            variant='ghost'
                            className={styles.danger}
                            onClick={confirmRevoke}
                            disabled={share.busy}
                        >
                            {t('texts.manage.revoke')}
                        </Button>
                    ) : (
                        <span />
                    )}
                    <Button
                        variant='secondary'
                        onClick={onClose}
                        disabled={share.busy}
                    >
                        {t('texts.manage.done')}
                    </Button>
                </DialogActions>
            }
        >
            <div className={styles.stack}>
                <div className={styles.notice}>
                    <GlobeIcon aria-hidden />
                    <div>
                        <strong>{t('texts.manage.anyone')}</strong>
                        <p>{t('texts.manage.visibility')}</p>
                    </div>
                </div>
                <p className={styles.copy}>
                    {t(
                        kind === 'folder'
                            ? 'texts.manage.liveFolder'
                            : 'texts.manage.liveText',
                    )}
                </p>
                {!share.capability && share.step !== 'revoked' && (
                    <>
                        {share.active && (
                            <InlineAlert
                                tone='warning'
                                title={t('texts.manage.activeLink')}
                            >
                                {t('texts.manage.securityNote')}
                            </InlineAlert>
                        )}
                        <Button
                            desktopIconOnly
                            onClick={share.create}
                            loading={share.busy}
                            leadingIcon={
                                share.active ? (
                                    <RefreshCwIcon size={16} />
                                ) : (
                                    <Link2Icon size={16} />
                                )
                            }
                        >
                            {t(
                                share.active
                                    ? 'texts.manage.replaceLink'
                                    : 'texts.manage.createLink',
                            )}
                        </Button>
                    </>
                )}
                {share.capability && (
                    <div className={styles.stack}>
                        <div className={styles.url}>
                            <Input
                                label={t('texts.manage.unlistedLink')}
                                ref={field}
                                value={share.url}
                                readOnly
                            />
                            <Button
                                desktopIconOnly
                                variant='secondary'
                                onClick={copy}
                                leadingIcon={
                                    share.copied ? (
                                        <CheckIcon size={16} />
                                    ) : (
                                        <CopyIcon size={16} />
                                    )
                                }
                            >
                                {t(
                                    share.copied
                                        ? 'texts.manage.copied'
                                        : 'texts.manage.copyLink',
                                )}
                            </Button>
                        </div>
                        <span role='status' className={styles.visuallyHidden}>
                            {share.copied ? t('texts.manage.copied') : ''}
                        </span>
                        {copyError && (
                            <InlineAlert tone='info'>
                                {t('texts.manage.copyManually')}
                            </InlineAlert>
                        )}
                        <Link
                            href={share.path}
                            className={styles.preview}
                            referrerPolicy='no-referrer'
                        >
                            <ExternalLinkIcon aria-hidden />
                            {t('texts.manage.preview')}
                        </Link>
                    </div>
                )}
                {share.step === 'confirm' && (
                    <InlineAlert
                        tone='warning'
                        title={t('texts.manage.revokeTitle')}
                        actions={
                            <div className={styles.actions}>
                                <Button
                                    variant='danger'
                                    size='compact'
                                    onClick={share.revoke}
                                    loading={share.busy}
                                >
                                    {t('texts.manage.revoke')}
                                </Button>
                                <Button
                                    variant='secondary'
                                    size='compact'
                                    onClick={keepLink}
                                    disabled={share.busy}
                                >
                                    {t('texts.manage.keepLink')}
                                </Button>
                            </div>
                        }
                    >
                        {t('texts.manage.revokeEffect')}
                    </InlineAlert>
                )}
                {share.step === 'revoked' && (
                    <InlineAlert
                        tone='success'
                        title={t('texts.manage.revoked')}
                        actions={
                            <Button
                                desktopIconOnly
                                variant='secondary'
                                size='compact'
                                onClick={share.create}
                                leadingIcon={<RefreshCwIcon size={16} />}
                            >
                                {t('texts.manage.newLink')}
                            </Button>
                        }
                    >
                        {t('texts.manage.privateAgain')}
                    </InlineAlert>
                )}
                {share.error && (
                    <InlineAlert tone='error'>{share.error}</InlineAlert>
                )}
            </div>
        </Dialog>
    );
}
