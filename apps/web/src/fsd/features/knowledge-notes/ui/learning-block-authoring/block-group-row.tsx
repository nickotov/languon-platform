'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BlockField, BlockGroup } from '../../lib/learning-block-form';
import type { BlockAuthoringLabels } from './block-labels';
import {
    BlockFieldInput,
    type BlockFieldEnhancement,
} from './block-field-input';
import styles from './learning-block-authoring.module.css';

export function GroupRow({
    group,
    index,
    row,
    labels,
    onRemove,
    enhance,
}: {
    group: BlockGroup;
    index: number;
    row: Record<string, string>;
    labels: BlockAuthoringLabels;
    onRemove(id: string): void;
    enhance?: BlockFieldEnhancement | undefined;
}) {
    const rowId = row.id!;
    const [term, setTerm] = useState(row.term ?? '');
    const [example, setExample] = useState(row.example ?? '');
    const [exampleTranslation, setExampleTranslation] = useState(
        row.exampleTranslation ?? '',
    );
    function remove() {
        onRemove(rowId);
    }
    const rowLabel = `${labels.field(group.name === 'entries' ? 'Entry' : 'Item')} ${index + 1}`;
    const removeLabel = `${labels.remove}: ${rowLabel}`;
    const primaryFields =
        group.name === 'entries' ? group.fields.slice(0, 2) : group.fields;
    const secondaryFields =
        group.name === 'entries'
            ? group.fields
                  .slice(2)
                  .filter((field) => field.name !== 'definition')
            : [];
    const definition =
        group.name === 'entries'
            ? group.fields.find((field) => field.name === 'definition')
            : undefined;
    function renderField(field: BlockField) {
        const name = `${group.name}.${index}.${field.name}`;
        let onValueChange: ((value: string) => void) | undefined;
        if (field.name === 'term') onValueChange = setTerm;
        if (field.name === 'example') onValueChange = setExample;
        if (field.name === 'exampleTranslation')
            onValueChange = setExampleTranslation;
        const hidden =
            group.name === 'entries' &&
            field.name === 'exampleTranslation' &&
            !example.trim() &&
            !exampleTranslation.trim();
        return (
            <div key={field.name} hidden={hidden}>
                <BlockFieldInput
                    field={field}
                    name={name}
                    value={row[field.name] ?? ''}
                    labels={labels}
                    enhance={enhance}
                    onValueChange={onValueChange}
                />
            </div>
        );
    }
    return (
        <div className={styles.row}>
            <input
                type='hidden'
                name={`${group.name}.${index}.id`}
                value={rowId}
            />
            <div className={styles.rowHeading}>
                <span>
                    {rowLabel}
                    {group.name === 'entries' && term && (
                        <span className={styles.entryTerm}> · {term}</span>
                    )}
                </span>
                <button
                    type='button'
                    onClick={remove}
                    className={styles.removeRow}
                    aria-label={removeLabel}
                >
                    <Trash2 size={16} aria-hidden />
                </button>
            </div>
            <div className={styles.primaryFields}>
                {primaryFields.map(renderField)}
            </div>
            {secondaryFields.map(renderField)}
            {definition && (
                <details
                    className={styles.optionalField}
                    open={row.definition?.trim() ? true : undefined}
                >
                    <summary>{labels.field('Definition')}</summary>
                    {renderField(definition)}
                </details>
            )}
        </div>
    );
}
