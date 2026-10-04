import {
    Archive,
    BookOpen,
    RotateCcw,
    Settings,
    Link as LinkIcon,
    Lock,
    MoreHorizontal,
    Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { languageLabel } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Card, Checkbox, Menu } from '@/fsd/shared/ui';
import type {
    DictionarySummary,
    DictionaryLifecycle,
    LanguageCatalogEntry,
} from '@languon/contracts';
import styles from '../dictionary-library-common.module.css';

type Props = {
    dictionary: DictionarySummary;
    catalog: readonly LanguageCatalogEntry[];
    disabled: boolean;
    onChangeLifecycle(input: {
        id: string;
        lifecycle: DictionaryLifecycle;
        version: number;
    }): void;
    selected: boolean;
    onToggleSelected(dictionaryId: string): void;
    onDelete(dictionary: DictionarySummary): void;
    onOpenSettings(dictionary: DictionarySummary): void;
};

export function LibraryDictionaryRow({
    dictionary,
    catalog,
    disabled,
    onChangeLifecycle,
    selected,
    onToggleSelected,
    onDelete,
    onOpenSettings,
}: Props) {
    const { href, locale, t } = useI18n();

    const path = href(`/dictionaries/${dictionary.id}`);

    const source = languageLabel(catalog, dictionary.sourceLanguage, locale);

    const target = languageLabel(catalog, dictionary.targetLanguage, locale);

    const pair = `${source} → ${target}`;

    const count = t('dictionary.library.cardCount', {
        count: dictionary.activeCardCount,
    });

    const updated = t('dictionary.library.updated', {
        date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
            new Date(dictionary.updatedAt),
        ),
    });

    const privateDictionary = dictionary.visibility === 'private';

    function resolveVisibilityIcon() {
        if (privateDictionary) {
            return <Lock aria-hidden size={14} />;
        }

        return <LinkIcon aria-hidden size={14} />;
    }

    const visibilityIcon = resolveVisibilityIcon();

    const visibilityTone = privateDictionary ? 'neutral' : 'warning';

    const visibilityLabel = t(`dictionary.visibility.${dictionary.visibility}`);

    const archived = dictionary.lifecycle === 'archived';

    const actionsLabel = t('dictionary.library.actions', {
        name: dictionary.name,
    });

    function openSettings() {
        onOpenSettings(dictionary);
    }

    function changeLifecycle() {
        onChangeLifecycle({
            id: dictionary.id,
            lifecycle: archived ? 'active' : 'archived',
            version: dictionary.version,
        });
    }

    function deleteDictionary() {
        onDelete(dictionary);
    }

    function toggleSelection() {
        onToggleSelected(dictionary.id);
    }

    const items = [
        {
            label: t('dictionary.settings.title'),
            disabled: archived,
            onSelect: openSettings,
            icon: <Settings size={16} />,
        },
    ];

    if (archived) {
        items.push({
            label: t('dictionary.deletion.deletePermanently'),
            disabled,
            onSelect: deleteDictionary,
            icon: <Trash2 size={16} />,
        });
    }

    let lifecycleLabel = t('dictionary.library.archive');

    let lifecycleIcon = <Archive size={16} />;

    if (archived) {
        lifecycleLabel = t('dictionary.library.restore');

        lifecycleIcon = <RotateCcw size={16} />;
    }

    items.push({
        label: lifecycleLabel,
        disabled,
        onSelect: changeLifecycle,
        icon: lifecycleIcon,
    });

    return (
        <li>
            <Card
                className={styles.dictionaryCard}
                padding='none'
                variant='outlined'
            >
                <span className={styles.dictionaryIcon}>
                    <BookOpen aria-hidden size={20} />
                </span>
                <div className={styles.cardContent}>
                    {archived ? (
                        <Checkbox
                            aria-label={t('dictionary.deletion.selectNamed', {
                                name: dictionary.name,
                            })}
                            checked={selected}
                            className={styles.rowSelection}
                            disabled={disabled}
                            onChange={toggleSelection}
                        />
                    ) : null}
                    <h2
                        className={styles.cardTitle}
                        dir='auto'
                        title={dictionary.name}
                    >
                        {archived ? (
                            <button
                                className={[
                                    styles.openLink,
                                    styles.openButton,
                                ].join(' ')}
                                disabled={disabled}
                                onClick={changeLifecycle}
                                type='button'
                            >
                                {dictionary.name}
                            </button>
                        ) : (
                            <Link className={styles.openLink} href={path}>
                                {dictionary.name}
                            </Link>
                        )}
                    </h2>
                    <div className={styles.cardMeta}>
                        <span>{pair}</span>
                        <Badge
                            icon={visibilityIcon}
                            size='sm'
                            tone={visibilityTone}
                        >
                            {visibilityLabel}
                        </Badge>
                        {archived ? (
                            <Badge size='sm'>
                                {t('dictionary.lifecycle.archived')}
                            </Badge>
                        ) : null}
                    </div>
                    {dictionary.description ? (
                        <p className={styles.description} dir='auto'>
                            {dictionary.description}
                        </p>
                    ) : null}
                    {archived ? (
                        <p className={styles.updated}>
                            {t('dictionary.library.restoreHelp')}
                        </p>
                    ) : null}
                    <div className={styles.cardFooter}>
                        <span>{count}</span>
                        <span>{updated}</span>
                    </div>
                </div>
                <div className={styles.rowActions}>
                    <Menu
                        iconOnly
                        label={actionsLabel}
                        trigger={<MoreHorizontal aria-hidden size={16} />}
                        items={items}
                    />
                </div>
            </Card>
        </li>
    );
}
