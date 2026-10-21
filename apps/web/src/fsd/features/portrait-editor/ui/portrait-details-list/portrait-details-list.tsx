import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import { labels } from '../../lib/copy';
import { portraitDetails } from '../../lib/details';
import styles from './portrait-details-list.module.css';
export function PortraitDetailsList({
    items,
    locale,
}: {
    items: PortraitItems;
    locale: Locale;
}) {
    const rows = portraitDetails(items, locale);
    const text = labels[locale];
    return (
        <dl className={styles.list}>
            {rows.map((row) => {
                const className = row.value ? styles.value : styles.unknown;
                return (
                    <div key={row.key} className={styles.row}>
                        <dt className={styles.term}>{row.term}</dt>
                        <dd className={className}>{row.value || text.none}</dd>
                    </div>
                );
            })}
        </dl>
    );
}
