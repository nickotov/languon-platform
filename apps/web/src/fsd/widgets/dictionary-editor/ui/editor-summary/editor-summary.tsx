import type { ComponentProps } from 'react';
import { languageLabel } from '@/fsd/entities/dictionary';
import { Badge, Breadcrumb, IconButton, InlineAlert } from '@/fsd/shared/ui';
import { Settings } from 'lucide-react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../dictionary-editor/dictionary-editor.module.css';
import { EditorSecondaryActions } from '../editor-secondary-actions/editor-secondary-actions';

export function EditorSummary({
    model,
}: {
    model: Pick<
        EditorViewFields,
        'current' | 'catalog' | 'locale' | 't' | 'href' | 'setSettingsOpen'
    > & {
        secondaryActions: ComponentProps<
            typeof EditorSecondaryActions
        >['model'];
    };
}) {
    const { current, catalog, locale, t, href, setSettingsOpen } = model;

    const archived = current.lifecycle === 'archived';

    const source = languageLabel(catalog, current.sourceLanguage, locale);

    const target = languageLabel(catalog, current.targetLanguage, locale);

    const settingsLabel = `${t('dictionary.settings.title')} — ${current.name}`;

    const breadcrumb = [
        { label: t('dictionary.backToLibrary'), href: href('/dictionaries') },
        { label: current.name },
    ];

    function openSettings() {
        setSettingsOpen(true);
    }

    return (
        <>
            <Breadcrumb items={breadcrumb} />
            <header className={styles.header}>
                <div className={styles.summaryContent}>
                    <div>
                        <h1>{current.name}</h1>
                        <div className={styles.metadata}>
                            <span>
                                {source} → {target}
                            </span>
                            <span>
                                {t('dictionary.editor.activeCardCount', {
                                    count: current.activeCardCount,
                                })}
                            </span>
                            <Badge>
                                {t(
                                    `dictionary.visibility.${current.visibility}`,
                                )}
                            </Badge>
                            {archived ? (
                                <Badge tone='warning'>
                                    {t('dictionary.lifecycle.archived')}
                                </Badge>
                            ) : null}
                        </div>
                        {current.description ? (
                            <p className={styles.description}>
                                {current.description}
                            </p>
                        ) : null}
                    </div>
                    <div className={styles.headerActions}>
                        <IconButton
                            className={styles.settingsAction}
                            type='button'
                            label={settingsLabel}
                            disabled={archived}
                            onClick={openSettings}
                        >
                            <Settings size={18} aria-hidden />
                        </IconButton>
                        <EditorSecondaryActions
                            model={model.secondaryActions}
                        />
                    </div>
                </div>
                {archived ? (
                    <InlineAlert tone='info'>
                        {t('dictionary.editor.archivedHelp')}
                    </InlineAlert>
                ) : null}
            </header>
        </>
    );
}
