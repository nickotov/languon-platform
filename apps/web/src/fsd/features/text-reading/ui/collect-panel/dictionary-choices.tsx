import { useEffect, useState } from 'react';
import { BookMarked, Check, Info, Search } from 'lucide-react';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import { Input } from '@/fsd/shared/ui';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import type { CollectController } from '../../hooks/use-collect';
import styles from './collect-panel.module.css';
export function DictionaryChoices({
    c,
    chosen,
    setChosen,
    requestWithSession,
}: {
    c: CollectController;
    chosen: string;
    setChosen: (id: string) => void;
    requestWithSession?: RequestWithTextSession | undefined;
}) {
    const t = useReadingCopy();
    const [from, to] = c.direction;
    const [query, setQuery] = useState('');
    const [hidden, setHidden] = useState(false);
    useEffect(() => {
        setHidden(false);
        if (!chosen || !requestWithSession) return;
        const control = new AbortController();
        void requestWithSession((token) =>
            dictionaryApi.readDictionary(token, chosen, control.signal),
        )
            .then((response) => {
                if (!control.signal.aborted)
                    setHidden(
                        !response.dictionary.settings.values
                            .definitionEnabled ||
                            !response.dictionary.settings.values.exampleEnabled,
                    );
            })
            .catch(() => undefined);
        return () => control.abort();
    }, [chosen, requestWithSession]);
    return (
        <>
            {' '}
            {c.dictionaries.length ? (
                <>
                    <strong>{t('texts.collect.choose')}</strong>
                    {c.dictionaries.length > 5 && (
                        <Input
                            type='search'
                            aria-label={t('texts.collect.filter')}
                            placeholder={t('texts.collect.filter')}
                            leadingIcon={<Search size={16} />}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    )}
                    <div
                        className={styles.choices}
                        role='radiogroup'
                        aria-label={t('texts.collect.choose')}
                    >
                        {c.dictionaries
                            .filter((d) =>
                                d.name
                                    .toLocaleLowerCase()
                                    .includes(query.trim().toLocaleLowerCase()),
                            )
                            .map((d) => (
                                <label
                                    key={d.id}
                                    className={`${styles.choice} ${chosen === d.id ? styles.checked : ''}`}
                                >
                                    <input
                                        type='radio'
                                        name='collection-dictionary'
                                        value={d.id}
                                        checked={chosen === d.id}
                                        onChange={() => setChosen(d.id)}
                                    />
                                    <span className={styles.radio} aria-hidden>
                                        {chosen === d.id && <Check size={12} />}
                                    </span>
                                    <span className={styles.choiceText}>
                                        <strong>{d.name}</strong>
                                        <small>
                                            {t('texts.collect.cards', {
                                                count: d.activeCardCount,
                                            })}
                                        </small>
                                    </span>
                                    <BookMarked size={16} aria-hidden />
                                </label>
                            ))}
                        {!c.dictionaries.some((d) =>
                            d.name
                                .toLocaleLowerCase()
                                .includes(query.trim().toLocaleLowerCase()),
                        ) && <p>{t('texts.collect.noMatch', { query })}</p>}
                    </div>
                </>
            ) : (
                <p className={styles.empty}>
                    {t('texts.collect.empty', { from, to })}
                </p>
            )}
            {hidden && (
                <p className={styles.context}>
                    <Info size={16} aria-hidden />
                    {t('texts.collect.hidden')}
                </p>
            )}
        </>
    );
}
