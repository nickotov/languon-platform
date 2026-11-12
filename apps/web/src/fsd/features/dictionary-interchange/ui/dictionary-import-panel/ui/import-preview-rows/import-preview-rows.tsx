import type { ChangeEvent } from 'react';
import type {
    LanguageCatalogEntry,
    PreviewDictionaryImportResponse,
} from '@languon/contracts';
import { languageDirection } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Card, Checkbox } from '@/fsd/shared/ui';
import styles from '../../../styles/dictionary-import-panel-common.module.css';

export function ImportPreviewRows({
    rows,
    canUseAi,
    selected,
    onToggle,
    languages,
    sourceLanguage,
    targetLanguage,
}: {
    rows: PreviewDictionaryImportResponse['rows'];
    canUseAi: boolean;
    selected: ReadonlySet<number>;
    onToggle(rowIndex: number, checked: boolean): void;
    languages: readonly LanguageCatalogEntry[];
    sourceLanguage: string;
    targetLanguage: string;
}) {
    const { t } = useI18n();

    return (
        <div className={styles.rows}>
            {rows.map((row) => {
                function changeSelection(event: ChangeEvent<HTMLInputElement>) {
                    onToggle(row.rowIndex, event.currentTarget.checked);
                }

                return (
                    <Card
                        className={styles.row}
                        key={row.rowIndex}
                        padding='sm'
                        variant='outlined'
                    >
                        {canUseAi ? (
                            <Checkbox
                                className={styles.rowSelection}
                                checked={selected.has(row.rowIndex)}
                                onChange={changeSelection}
                            >
                                {t('dictionary.interchange.includeRow', {
                                    position: row.rowIndex + 1,
                                })}
                            </Checkbox>
                        ) : null}
                        <span
                            className={styles.rowValue}
                            dir={languageDirection(languages, sourceLanguage)}
                            lang={sourceLanguage}
                        >
                            {row.source}
                        </span>
                        <span aria-hidden='true' className={styles.rowArrow}>
                            →
                        </span>
                        <span
                            className={styles.rowValue}
                            dir={languageDirection(languages, targetLanguage)}
                            lang={targetLanguage}
                        >
                            {row.translation}
                        </span>
                    </Card>
                );
            })}
        </div>
    );
}
