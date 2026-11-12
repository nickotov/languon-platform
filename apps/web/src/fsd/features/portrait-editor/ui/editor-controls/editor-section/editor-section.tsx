'use client';
import { useId, type ReactNode } from 'react';
import type { Locale } from '@/fsd/shared/i18n';
import { labels, copy } from '../../../lib/copy';
import styles from '../../styles/common-common.module.css';

export function EditorSection({
    title,
    description,
    count,
    optional,
    locale,
    children,
}: {
    title: string;
    description?: string;
    count?: number;
    optional?: boolean;
    locale: Locale;
    children: ReactNode;
}) {
    const id = useId();
    const text = labels[locale];
    const countLabel =
        count === 0
            ? copy(
                  locale,
                  'Nothing added',
                  'Ничего не добавлено',
                  'Aucun élément',
                  'Ningún elemento',
              )
            : copy(
                  locale,
                  `${count} item${count === 1 ? '' : 's'}`,
                  `Пунктов: ${count}`,
                  `${count} élément${count === 1 ? '' : 's'}`,
                  `${count} elemento${count === 1 ? '' : 's'}`,
              );

    return (
        <section className={styles.section} aria-labelledby={id}>
            <header className={styles.header}>
                <div>
                    <h3 className={styles.title} id={id}>
                        {title}{' '}
                        {optional && (
                            <span className={styles.meta}>{text.optional}</span>
                        )}
                    </h3>
                    {description && (
                        <p className={styles.description}>{description}</p>
                    )}
                </div>
                {count !== undefined && (
                    <span className={styles.meta}>{countLabel}</span>
                )}
            </header>
            <div className={styles.fields}>{children}</div>
        </section>
    );
}
