import { ArrowLeft, ArrowRight, Copy } from 'lucide-react';
import type { TextDocument } from '@languon/contracts';
import { Button, ButtonLink, Switch } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './public-page.module.css';
export function PublicReaderHeader({
    text,
    folderName,
    backHref,
    match,
    onMatch,
    onCopy,
}: {
    text: TextDocument;
    folderName: string | undefined;
    backHref: string;
    match: boolean;
    onMatch(value: boolean): void;
    onCopy(): void;
}) {
    const { href, locale, t } = useI18n();
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    return (
        <div className={styles.readerHeader}>
            <div className={styles.readerTitle}>
                {folderName && (
                    <ButtonLink
                        href={href(backHref)}
                        variant='quiet'
                        size='compact'
                    >
                        <ArrowLeft size={14} aria-hidden />
                        {folderName}
                    </ButtonLink>
                )}
                <h1>{text.title}</h1>
                <p className={styles.languages}>
                    {names.of(text.sourceLanguage)}
                    <ArrowRight size={12} aria-hidden />
                    {names.of(text.targetLanguage)} · {t('texts.public.anyone')}
                </p>
            </div>
            <div className={styles.actions}>
                <Switch
                    size='sm'
                    label={t('texts.public.match')}
                    checked={match}
                    onCheckedChange={onMatch}
                />
                <Button
                    variant='secondary'
                    size='compact'
                    onClick={onCopy}
                    leadingIcon={<Copy size={16} aria-hidden />}
                >
                    {t('texts.public.copyText')}
                </Button>
            </div>
        </div>
    );
}
