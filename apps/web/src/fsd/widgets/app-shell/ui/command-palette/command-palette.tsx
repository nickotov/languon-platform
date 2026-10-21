import { Search } from 'lucide-react';
import { Fragment, useEffect, useRef, type ChangeEvent } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Dialog } from '@/fsd/shared/ui';
import { usePalette } from '../../hooks/use-palette';
import styles from './command-palette.module.css';
import { PaletteRow } from './palette-row';

export function CommandPalette({ onClose }: { onClose(): void }) {
    const { t } = useI18n();
    const palette = usePalette(onClose);
    const listRef = useRef<HTMLUListElement>(null);
    const activeId = palette.selected
        ? `palette-${palette.selected.id}`
        : undefined;
    function change(event: ChangeEvent<HTMLInputElement>) {
        palette.changeQuery(event.target.value);
    }
    function retry() {
        void palette.resources.refetch();
    }
    useEffect(() => {
        if (activeId)
            document
                .getElementById(activeId)
                ?.scrollIntoView?.({ block: 'nearest' });
    }, [activeId]);
    return (
        <Dialog
            bodyClassName={styles.body}
            className={styles.dialog}
            onClose={onClose}
            open
            showHeader={false}
            size='md'
            title={t('shell.search')}
        >
            <div className={styles.search}>
                <Search aria-hidden size={20} />
                <input
                    aria-activedescendant={activeId}
                    aria-controls='command-palette-results'
                    aria-expanded='true'
                    aria-haspopup='grid'
                    aria-label={t('shell.search')}
                    autoFocus
                    maxLength={200}
                    onChange={change}
                    onKeyDown={palette.keyDown}
                    placeholder={t('shell.searchPlaceholder')}
                    role='combobox'
                    value={palette.query}
                />
            </div>
            <ul
                aria-label={t('shell.search')}
                aria-colcount={2}
                className={styles.list}
                id='command-palette-results'
                ref={listRef}
                role='grid'
            >
                {palette.resources.isPending ? (
                    <li role='row'>
                        <div
                            aria-colspan={2}
                            className={styles.message}
                            role='gridcell'
                        >
                            {t('shell.loading')}
                        </div>
                    </li>
                ) : null}
                {palette.resources.isError ? (
                    <li role='row'>
                        <div
                            aria-colspan={2}
                            className={styles.message}
                            role='gridcell'
                        >
                            <span role='alert'>{t('shell.loadFailed')}</span>
                            <button onClick={retry} type='button'>
                                {t('shell.retry')}
                            </button>
                        </div>
                    </li>
                ) : null}
                {!palette.resources.isPending &&
                !palette.resources.isError &&
                !palette.resources.data?.resources.length ? (
                    <li role='row'>
                        <div
                            aria-colspan={2}
                            className={styles.message}
                            role='gridcell'
                        >
                            {t(
                                palette.query.trim()
                                    ? 'shell.noMatches'
                                    : 'shell.noRecent',
                            )}
                        </div>
                    </li>
                ) : null}
                {palette.items.map((item, index) => (
                    <Fragment key={item.id}>
                        {index === 0 ||
                        palette.items[index - 1]?.group !== item.group ? (
                            <li role='row'>
                                <div
                                    aria-colspan={2}
                                    className={styles.heading}
                                    role='gridcell'
                                >
                                    {t(`shell.${item.group}`)}
                                </div>
                            </li>
                        ) : null}
                        <PaletteRow
                            active={item === palette.selected}
                            item={item}
                            onRun={palette.run}
                            onActive={palette.select}
                        />
                    </Fragment>
                ))}
            </ul>
            <div className={styles.footer}>
                <span>
                    <kbd>↑</kbd>
                    <kbd>↓</kbd>
                    {t('shell.searchHintNavigate')}
                </span>
                <span>
                    <kbd>↵</kbd>
                    {t('shell.searchHintOpen')}
                </span>
                <span>
                    <kbd>esc</kbd>
                    {t('shell.searchHintClose')}
                </span>
            </div>
        </Dialog>
    );
}
