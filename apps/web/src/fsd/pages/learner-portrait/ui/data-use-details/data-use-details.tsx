import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { dataUsePoints, portraitCopy } from '../../lib/copy';
import styles from './data-use-details.module.css';

export function DataUseDetails() {
    const { locale } = useI18n();
    return (
        <details className={styles.details}>
            <summary className={styles.summary}>
                <ShieldCheck aria-hidden size={20} />
                <span>{portraitCopy(locale, 'data')}</span>
            </summary>
            <ul className={styles.list}>
                {dataUsePoints[locale].map((point) => (
                    <li key={point}>{point}</li>
                ))}
            </ul>
        </details>
    );
}
