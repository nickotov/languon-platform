import {
    Archive,
    RotateCcw,
    Settings,
    Link as LinkIcon,
    Lock,
    MoreHorizontal,
    Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { languageLabel } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Card, Checkbox, Menu } from '@/fsd/shared/ui';
import type {
    DictionarySummary,
    DictionaryLifecycle,
    LanguageCatalogEntry,
} from '@languon/contracts';
import styles from '../dictionary-library/dictionary-library.module.css';

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
};

export function LibraryDictionaryRow({
    dictionary,
    catalog,
    disabled,
    onChangeLifecycle,
    selected,
    onToggleSelected,
    onDelete,
}: Props) {
    const { href, locale, t } = useI18n();
    const router = useRouter();
    const path = href(`/dictionaries/${dictionary.id}`);
    const settingsPath = href(`/dictionaries/${dictionary.id}?settings=open`);
    const source = languageLabel(catalog, dictionary.sourceLanguage, locale);
    const target = languageLabel(catalog, dictionary.targetLanguage, locale);
    const pair = `${source} → ${target}`;
    const count = t('dictionary.library.cardCount', {
        count: dictionary.activeCardCount,
    });
    const privateDictionary = dictionary.visibility === 'private';
    const visibilityIcon = privateDictionary ? (
        <Lock aria-hidden size={14} />
    ) : (
        <LinkIcon aria-hidden size={14} />
    );
    const visibilityTone = privateDictionary ? 'neutral' : 'warning';
    const visibilityLabel = t(`dictionary.visibility.${dictionary.visibility}`);
    const archived = dictionary.lifecycle === 'archived';
    const actionsLabel = t('dictionary.library.actions', {
        name: dictionary.name,
    });

    function openSettings() {
        router.push(settingsPath);
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
        ...(archived
            ? [
                  {
                      label: t('dictionary.deletion.deletePermanently'),
                      disabled,
                      onSelect: deleteDictionary,
                      icon: <Trash2 size={16} />,
                  },
              ]
            : []),
        {
            label: t(
                archived
                    ? 'dictionary.library.restore'
                    : 'dictionary.library.archive',
            ),
            disabled,
            onSelect: changeLifecycle,
            icon: archived ? <RotateCcw size={16} /> : <Archive size={16} />,
        },
    ];

    return (
        <li>
            <Card
                className={styles.dictionaryCard}
                padding='none'
                variant='outlined'
            >
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
                    <h2 dir='auto'>
                        {archived ? (
                            <button
                                className={styles.openLink}
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
                        <span>{count}</span>
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
