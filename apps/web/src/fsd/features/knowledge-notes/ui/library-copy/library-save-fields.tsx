import type { ChangeEventHandler } from 'react';
import { TextLanguageSchema } from '@languon/contracts';
import { Input } from '@/fsd/shared/ui';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import type { LibraryContentBlock } from '../../types';
import { LibraryItemPicker, type LibraryItem } from './library-item-picker';
import { LibraryEntrySelection } from './library-entry-selection';
import type { LibraryLabels } from './library-labels';
import styles from './library-copy.module.css';

export interface LibrarySaveFieldsProps {
    block: LibraryContentBlock;
    context: KnowledgeLibraryContext;
    labels: LibraryLabels;
    busy: boolean;
    destination: string;
    name: string;
    translation: string;
    entries: string[];
    kind: 'dictionary' | 'text';
    onDestination: ChangeEventHandler<HTMLInputElement>;
    onName: ChangeEventHandler<HTMLInputElement>;
    onTranslation: ChangeEventHandler<HTMLSelectElement>;
    onToggleEntry: ChangeEventHandler<HTMLInputElement>;
    onSelectItem: (item: LibraryItem | null) => void;
}

export function LibrarySaveFields({
    block,
    context,
    labels,
    busy,
    destination,
    name,
    translation,
    entries,
    kind,
    onDestination,
    onName,
    onTranslation,
    onToggleEntry,
    onSelectItem,
}: LibrarySaveFieldsProps) {
    return (
        <fieldset disabled={busy} className={styles.form}>
            <fieldset className={styles.destinationChoices}>
                <legend>{labels.destination}</legend>
                <label
                    className={styles.destinationChoice}
                    data-selected={destination === 'new' || undefined}
                >
                    <input
                        type='radio'
                        name='library-destination'
                        value='new'
                        checked={destination === 'new'}
                        onChange={onDestination}
                    />
                    <span>{labels.fresh}</span>
                </label>
                <label
                    className={styles.destinationChoice}
                    data-selected={destination === 'existing' || undefined}
                >
                    <input
                        type='radio'
                        name='library-destination'
                        value='existing'
                        checked={destination === 'existing'}
                        onChange={onDestination}
                    />
                    <span>{labels.existing}</span>
                </label>
            </fieldset>
            {destination === 'new' ? (
                <Input
                    label={labels.name}
                    value={name}
                    onChange={onName}
                    maxLength={200}
                    required
                />
            ) : (
                <LibraryItemPicker
                    kind={kind}
                    request={context.requestWithSession}
                    labels={labels}
                    onSelect={onSelectItem}
                />
            )}
            {block.type === 'vocabulary' && (
                <LibraryEntrySelection
                    entries={block.entries}
                    selected={entries}
                    label={labels.selected}
                    onChange={onToggleEntry}
                />
            )}
            {block.type === 'bilingual-text' && (
                <label>
                    {labels.language}
                    <select
                        value={translation}
                        onChange={onTranslation}
                        disabled={Boolean(context.privateTranslation)}
                    >
                        {TextLanguageSchema.options
                            .filter((language) => language !== block.language)
                            .map((language) => (
                                <option key={language} value={language}>
                                    {language}
                                </option>
                            ))}
                    </select>
                </label>
            )}
        </fieldset>
    );
}
