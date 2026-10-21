'use client';
import { useId } from 'react';
import { CircleMinus, CirclePlus, Pencil } from 'lucide-react';
import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import { copy, labels } from '../../lib/copy';
import { portraitDiff } from '../../lib/details';
import common from '../common.module.css';
import styles from './portrait-update-diff.module.css';
export function PortraitUpdateDiff({
    before,
    after,
    locale,
}: {
    before: PortraitItems;
    after: PortraitItems;
    locale: Locale;
}) {
    const id = useId();
    const text = labels[locale];
    const entries = portraitDiff(before, after, locale);
    const description = copy(
        locale,
        'Your saved portrait stays active until you save this update.',
        'Сохранённый портрет действует, пока вы не сохраните обновление.',
        'Votre portrait enregistré reste actif jusqu’à l’enregistrement de cette mise à jour.',
        'Tu retrato guardado sigue activo hasta que guardes esta actualización.',
    );
    const empty = copy(
        locale,
        'No changes yet.',
        'Пока нет изменений.',
        'Aucune modification pour le moment.',
        'Todavía no hay cambios.',
    );
    return (
        <section className={common.section} aria-labelledby={id}>
            <h2 id={id} className={common.title}>
                {text.changes}
            </h2>
            <p className={common.description}>{description}</p>
            {entries.length === 0 ? (
                <p className={common.empty}>{empty}</p>
            ) : (
                <ul className={styles.list}>
                    {entries.map((entry) => {
                        const Icon = {
                            added: CirclePlus,
                            removed: CircleMinus,
                            changed: Pencil,
                        }[entry.kind];
                        const kindClass = styles[entry.kind];
                        const valueClass =
                            entry.kind === 'removed'
                                ? styles.removedValue
                                : styles.value;
                        return (
                            <li key={entry.key} className={styles.row}>
                                <Icon
                                    className={[common.icon, kindClass].join(
                                        ' ',
                                    )}
                                    aria-hidden='true'
                                />
                                <div className={styles.body}>
                                    <p>
                                        <span className={kindClass}>
                                            {text[entry.kind]}
                                        </span>
                                        <span className={common.meta}>
                                            {' '}
                                            · {entry.term}
                                        </span>
                                    </p>
                                    <p className={valueClass}>{entry.text}</p>
                                    {entry.kind === 'changed' && (
                                        <p className={common.meta}>
                                            {text.was}: {entry.before}
                                        </p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
