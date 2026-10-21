'use client';
import { useId } from 'react';
import { Inbox } from 'lucide-react';
import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import { labels, copy } from '../../lib/copy';
import { hasMeaningfulPortraitItems } from '../../lib/items';
import { previewPortraitSummary } from '../../lib/summary';
import common from '../common.module.css';
import styles from './portrait-summary-panel.module.css';
export function PortraitSummaryPanel({
    items,
    locale,
    summary,
    compact = false,
    title,
}: {
    items: PortraitItems;
    locale: Locale;
    summary?: string;
    compact?: boolean;
    title?: string;
}) {
    const id = useId();
    const text = labels[locale];
    const hasItems = hasMeaningfulPortraitItems(items);
    const content = summary ?? previewPortraitSummary(items, locale);
    const paragraphs = content.split(/\n+/).filter(Boolean);
    const sparse = content.split(/\s+/u).filter(Boolean).length < 60;
    const languageName =
        new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ??
        locale;
    const updates = copy(
        locale,
        'Updates as you edit',
        'Обновляется при редактировании',
        'Actualisé pendant la modification',
        'Se actualiza al editar',
    );
    const written = copy(
        locale,
        'Written in',
        'Язык описания:',
        'Rédigé en',
        'Escrito en',
    );
    const metadata = `${written} ${languageName} · ${updates}`;
    const emptyHelp = copy(
        locale,
        'Add at least one item — a language, goal, or preference — and a summary will appear here. We won’t invent one for you.',
        'Добавьте хотя бы один пункт — язык, цель или предпочтение — и здесь появится описание. Мы не придумываем сведения о вас.',
        'Ajoutez au moins une langue, un objectif ou une préférence. Le résumé apparaîtra ici sans rien inventer.',
        'Añade al menos un idioma, objetivo o preferencia y aparecerá un resumen. No inventaremos información.',
    );
    const sectionClass = compact ? styles.compact : common.section;
    return (
        <section className={sectionClass} aria-labelledby={id}>
            <header className={common.header}>
                <h2 id={id} className={common.title}>
                    {title ?? text.summary}
                </h2>
                {hasItems && <span className={common.meta}>{metadata}</span>}
            </header>
            {hasItems ? (
                <div
                    className={styles.content}
                    aria-live='polite'
                    lang={locale}
                >
                    {paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                    ))}
                    {sparse && (
                        <p className={common.description}>{text.short}</p>
                    )}
                </div>
            ) : (
                <div className={styles.empty}>
                    <Inbox aria-hidden='true' className={styles.icon} />
                    <div>
                        <p className={styles.emptyTitle}>{text.empty}</p>
                        <p className={common.description}>{emptyHelp}</p>
                    </div>
                </div>
            )}
        </section>
    );
}
