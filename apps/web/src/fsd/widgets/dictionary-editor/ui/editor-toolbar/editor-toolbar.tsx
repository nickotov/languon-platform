import { Input } from '@/fsd/shared/ui';
import { Search } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../dictionary-editor-common.module.css';

export function EditorToolbar({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'cardLifecycle'
        | 'setCardLifecycle'
        | 'search'
        | 'setSearch'
        | 'current'
    >;
}) {
    const { t, cardLifecycle, setCardLifecycle, search, setSearch } = model;

    const searchLabel = t('dictionary.cards.search');

    const lifecycleLabel = t('dictionary.cards.lifecycle');

    const activeSelected = cardLifecycle === 'active';

    const archivedSelected = cardLifecycle === 'archived';

    function showActive() {
        setCardLifecycle('active');
    }

    function showArchived() {
        setCardLifecycle('archived');
    }

    function changeSearch(event: ChangeEvent<HTMLInputElement>) {
        setSearch(event.currentTarget.value);
    }

    return (
        <div className={styles.filters}>
            <div
                role='group'
                aria-label={lifecycleLabel}
                className={styles.statusTabs}
            >
                <button
                    className={styles.statusTab}
                    type='button'
                    aria-pressed={activeSelected}
                    onClick={showActive}
                >
                    <span>{t('dictionary.lifecycle.active')}</span>
                    <span className={styles.tabCount}>
                        {model.current.activeCardCount}
                    </span>
                </button>
                <button
                    className={styles.statusTab}
                    id='archived-cards-filter'
                    type='button'
                    aria-pressed={archivedSelected}
                    onClick={showArchived}
                >
                    {t('dictionary.lifecycle.archived')}
                </button>
            </div>
            <Input
                wrapperClassName={styles.search}
                type='search'
                size='sm'
                aria-label={searchLabel}
                placeholder={searchLabel}
                value={search}
                onChange={changeSearch}
                leadingIcon={<Search size={16} aria-hidden />}
            />
        </div>
    );
}
