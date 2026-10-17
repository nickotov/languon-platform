import type { TextDocument, TextFolder } from '@languon/contracts';
import { ArrowRight, BookOpen, Copy, Folder } from 'lucide-react';
import { Button, ButtonLink } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './public-page.module.css';

export function PublicFolder({
    folder,
    texts,
    basePath,
    shareKey,
    onCopyFolder,
    onCopyText,
}: {
    folder: TextFolder;
    texts: TextDocument[];
    basePath: string;
    shareKey: string;
    onCopyFolder(): void;
    onCopyText(text: TextDocument): void;
}) {
    const { t } = useI18n();

    return (
        <main className={styles.folder}>
            <div className={styles.folderHeading}>
                <div className={styles.folderInfo}>
                    <p className={styles.eyebrow}>
                        <Folder size={14} aria-hidden />
                        {t('texts.public.sharedFolder')}
                    </p>
                    <h1>{folder.name}</h1>
                    {folder.description && <p>{folder.description}</p>}
                    <p className={styles.muted}>
                        {folder.translatedCount ?? texts.length}{' '}
                        {t('texts.public.translated')} ·{' '}
                        {t('texts.public.live')}
                    </p>
                </div>
                <Button
                    desktopIconOnly
                    variant='secondary'
                    onClick={onCopyFolder}
                    leadingIcon={<Copy size={16} aria-hidden />}
                >
                    {t('texts.public.copyFolder')}
                </Button>
            </div>
            <ul className={styles.list}>
                {texts.map((text) => (
                    <PublicTextRow
                        key={text.id}
                        text={text}
                        basePath={basePath}
                        shareKey={shareKey}
                        onCopy={onCopyText}
                    />
                ))}
                {texts.length === 0 && (
                    <li className={styles.empty}>{t('texts.public.empty')}</li>
                )}
            </ul>
        </main>
    );
}

function PublicTextRow({
    text,
    basePath,
    shareKey,
    onCopy,
}: {
    text: TextDocument;
    basePath: string;
    shareKey: string;
    onCopy(text: TextDocument): void;
}) {
    const { href, locale, t } = useI18n();
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    const target = href(`${basePath}/texts/${text.id}#${shareKey}`);

    function handleCopy() {
        onCopy(text);
    }

    return (
        <li className={styles.row}>
            <div className={styles.rowInfo}>
                <h2>{text.title}</h2>
                <p className={styles.languages}>
                    {names.of(text.sourceLanguage)}
                    <ArrowRight size={12} aria-hidden />
                    {names.of(text.targetLanguage)}
                </p>
            </div>
            <div className={styles.actions}>
                <ButtonLink
                    desktopIconOnly
                    leadingIcon={<BookOpen size={16} aria-hidden />}
                    href={target}
                >
                    {t('texts.public.read')}
                </ButtonLink>
                <Button
                    desktopIconOnly
                    variant='secondary'
                    onClick={handleCopy}
                    leadingIcon={<Copy size={16} aria-hidden />}
                >
                    {t('texts.public.copy')}
                </Button>
            </div>
        </li>
    );
}
