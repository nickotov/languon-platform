import { LanguageSwitcher } from '@/fsd/features/change-locale';

import styles from './site-header.module.css';

export function SiteHeader() {
    return (
        <header className={styles.header}>
            <LanguageSwitcher />
        </header>
    );
}
