'use client';
import { BookOpen, LineChart, Sparkles } from 'lucide-react';
import { type ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import styles from '../styles/auth-ui-common.module.css';

export function AuthShell({
    children,
    description,
    eyebrow,
    footer,
    title,
    variant = 'auth',
}: {
    children: ReactNode;
    description?: ReactNode;
    eyebrow: string;
    footer?: ReactNode;
    title: string;
    variant?: 'account' | 'auth';
}) {
    const { t } = useI18n();

    if (variant === 'account') {
        return (
            <main className={styles.accountLayout}>
                <section
                    className={styles.accountCard}
                    aria-labelledby='auth-title'
                >
                    <div className={styles.headingGroup}>
                        <p className={styles.eyebrow}>{eyebrow}</p>
                        <h1 className={styles.title} id='auth-title'>
                            {title}
                        </h1>
                    </div>
                    {children}
                </section>
            </main>
        );
    }

    return (
        <main className={styles.layout}>
            <aside className={styles.story}>
                <div className={styles.storyContent}>
                    <p className={styles.storyTitle}>{t('auth.storyTitle')}</p>
                    <ul className={styles.benefits}>
                        <li className={styles.benefit}>
                            <span className={styles.benefitIcon}>
                                <Sparkles
                                    aria-hidden='true'
                                    className={styles.benefitGraphic}
                                />
                            </span>
                            <span>
                                <strong className={styles.benefitTitle}>
                                    {t('auth.storyBenefitLevel')}
                                </strong>
                                <small className={styles.benefitDescription}>
                                    {t('auth.storyBenefitLevelBody')}
                                </small>
                            </span>
                        </li>
                        <li className={styles.benefit}>
                            <span className={styles.benefitIcon}>
                                <BookOpen
                                    aria-hidden='true'
                                    className={styles.benefitGraphic}
                                />
                            </span>
                            <span>
                                <strong className={styles.benefitTitle}>
                                    {t('auth.storyBenefitContext')}
                                </strong>
                                <small className={styles.benefitDescription}>
                                    {t('auth.storyBenefitContextBody')}
                                </small>
                            </span>
                        </li>
                        <li className={styles.benefit}>
                            <span className={styles.benefitIcon}>
                                <LineChart
                                    aria-hidden='true'
                                    className={styles.benefitGraphic}
                                />
                            </span>
                            <span>
                                <strong className={styles.benefitTitle}>
                                    {t('auth.storyBenefitProgress')}
                                </strong>
                                <small className={styles.benefitDescription}>
                                    {t('auth.storyBenefitProgressBody')}
                                </small>
                            </span>
                        </li>
                    </ul>
                </div>
                <p className={styles.proof}>{t('auth.storyProof')}</p>
            </aside>
            <section className={styles.formPanel}>
                <div className={styles.authMain}>
                    <section
                        className={styles.authSection}
                        aria-labelledby='auth-title'
                    >
                        <div className={styles.card}>
                            <header className={styles.headingGroup}>
                                <p className={styles.eyebrow}>{eyebrow}</p>
                                <h1 className={styles.title} id='auth-title'>
                                    {title}
                                </h1>
                                {description ? (
                                    <p className={styles.description}>
                                        {description}
                                    </p>
                                ) : null}
                            </header>
                            {children}
                        </div>
                        {footer ? (
                            <div className={styles.authFooter}>{footer}</div>
                        ) : null}
                    </section>
                </div>
            </section>
        </main>
    );
}
