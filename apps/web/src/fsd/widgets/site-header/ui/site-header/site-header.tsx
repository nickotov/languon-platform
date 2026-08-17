import { LanguageSwitcher } from '@/fsd/features/change-locale';
import { ThemeSwitcher } from '@/fsd/features/change-theme';

import styles from './site-header.module.css';

export function SiteHeader() {
    return (
        <header className={styles.header}>
            <ThemeSwitcher />
            <LanguageSwitcher />
        </header>
    );
}
