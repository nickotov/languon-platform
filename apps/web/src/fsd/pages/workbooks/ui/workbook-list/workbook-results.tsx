import type { Workbook } from '@languon/contracts';
import Link from 'next/link';
import { workbookLabels } from '@/fsd/features/workbooks';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import styles from '../styles/workbook-layout-common.module.css';

export function WorkbookResults({
    workbooks,
    failed,
    hasMore,
    loading,
    onMore,
}: {
    workbooks: Workbook[];
    failed: boolean;
    hasMore: boolean;
    loading: boolean;
    onMore(): void;
}) {
    const { locale, href, t } = useI18n();
    const labels = workbookLabels(locale);

    return (
        <>
            {workbooks.length === 0 && <p>{labels.empty}</p>}
            <ul className={styles.list}>
                {workbooks.map((book) => (
                    <li key={book.id} className={styles.panel}>
                        <Link
                            className={styles.link}
                            href={href(`/workbooks/${book.id}`)}
                        >
                            {book.title}
                        </Link>
                        <span>
                            {labels.notes}: {book.notes.length}
                        </span>
                    </li>
                ))}
            </ul>
            {failed && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
            {hasMore && (
                <Button variant='secondary' loading={loading} onClick={onMore}>
                    {t('knowledge.loadMore')}
                </Button>
            )}
        </>
    );
}
