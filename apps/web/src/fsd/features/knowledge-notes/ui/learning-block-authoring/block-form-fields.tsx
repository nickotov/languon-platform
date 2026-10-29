'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { BlockGroup } from '../../lib/learning-block-form';
import type { BlockAuthoringLabels } from './block-labels';
import type { BlockFieldEnhancement } from './block-field-input';
import { GroupRow } from './block-group-row';
import styles from './learning-block-authoring.module.css';

export {
    BlockFieldInput,
    type BlockFieldEnhancement,
} from './block-field-input';

export function BlockRowGroup({
    group,
    labels,
    onCount,
    enhance,
}: {
    group: BlockGroup;
    labels: BlockAuthoringLabels;
    onCount(name: string, count: number): void;
    enhance?: BlockFieldEnhancement | undefined;
}) {
    const [rows, setRows] = useState(() =>
        group.rows.map((row) => ({
            ...row,
            id: row.id ?? crypto.randomUUID(),
        })),
    );
    function add() {
        const next = [...rows, { id: crypto.randomUUID() }];
        setRows(next);
        onCount(group.name, next.length);
    }
    function remove(id: string) {
        const next = rows.filter((row) => row.id !== id);
        setRows(next);
        onCount(group.name, next.length);
    }
    const limits: Record<string, number> = {
        examples: 50,
        mistakes: 50,
        entries: 200,
        segments: 500,
        transcript: 500,
        choices: 12,
    };
    const maximum = limits[group.name] ?? 100;
    const legend = labels.field(group.label);
    function renderRow(row: Record<string, string>, index: number) {
        return (
            <GroupRow
                key={row.id}
                group={group}
                row={row}
                index={index}
                labels={labels}
                onRemove={remove}
                enhance={enhance}
            />
        );
    }
    return (
        <fieldset
            className={styles.group}
            aria-label={group.name === 'entries' ? legend : undefined}
        >
            {group.name !== 'entries' && <legend>{legend}</legend>}
            {rows.map(renderRow)}
            <button
                type='button'
                className={styles.addRow}
                onClick={add}
                disabled={rows.length >= maximum}
            >
                <Plus size={16} aria-hidden />
                {labels.addRow}
            </button>
        </fieldset>
    );
}
