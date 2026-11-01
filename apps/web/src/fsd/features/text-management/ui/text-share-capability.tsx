import Link from 'next/link';
import type { Ref } from 'react';
import { CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, Input } from '@/fsd/shared/ui';
import styles from './dialogs.module.css';

export function TextShareCapability({
    fieldRef,
    url,
    path,
    copied,
    copyError,
    onCopy,
}: {
    fieldRef: Ref<HTMLInputElement>;
    url: string;
    path: string;
    copied: boolean;
    copyError: boolean;
    onCopy(): Promise<void>;
}) {
    const { t } = useI18n();

    return (
        <div className={styles.stack}>
            <div className={styles.url}>
                <Input
                    label={t('texts.manage.unlistedLink')}
                    ref={fieldRef}
                    value={url}
                    readOnly
                />
                <Button
                    desktopIconOnly
                    variant='secondary'
                    onClick={onCopy}
                    leadingIcon={
                        copied ? (
                            <CheckIcon size={16} />
                        ) : (
                            <CopyIcon size={16} />
                        )
                    }
                >
                    {t(
                        copied
                            ? 'texts.manage.copied'
                            : 'texts.manage.copyLink',
                    )}
                </Button>
            </div>
            <span role='status' className={styles.visuallyHidden}>
                {copied ? t('texts.manage.copied') : ''}
            </span>
            {copyError && (
                <InlineAlert tone='info'>
                    {t('texts.manage.copyManually')}
                </InlineAlert>
            )}
            <Link
                href={path}
                className={styles.preview}
                referrerPolicy='no-referrer'
            >
                <ExternalLinkIcon aria-hidden />
                {t('texts.manage.preview')}
            </Link>
        </div>
    );
}
