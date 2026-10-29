'use client';

import { useState } from 'react';
import { Button, Input, Textarea } from '@/fsd/shared/ui';
import type { BlockField, BlockGroup } from '../../lib/learning-block-form';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';

export function BlockFieldInput({
    field,
    name,
    value,
    labels,
}: {
    field: BlockField;
    name?: string;
    value?: string;
    labels: BlockAuthoringLabels;
}) {
    const label = labels.field(field.label);
    const inputName = name ?? field.name;
    const initial = value ?? field.value ?? '';
    if (field.name === 'format')
        return (
            <label className={styles.field}>
                {label}
                <select name={inputName} defaultValue={initial}>
                    <option value='free-text'>
                        {labels.field('Free text')}
                    </option>
                    <option value='multiple-choice'>
                        {labels.field('Multiple choice')}
                    </option>
                    <option value='fill-in-the-blank'>
                        {labels.field('Fill in the blank')}
                    </option>
                </select>
            </label>
        );
    if (field.multiline)
        return (
            <Textarea
                name={inputName}
                label={label}
                defaultValue={initial}
                rows={3}
            />
        );
    return <Input name={inputName} label={label} defaultValue={initial} />;
}

export function BlockRowGroup({
    group,
    labels,
    onCount,
}: {
    group: BlockGroup;
    labels: BlockAuthoringLabels;
    onCount(name: string, count: number): void;
}) {
    const [count, setCount] = useState(group.rows.length);
    function add() {
        const next = count + 1;
        setCount(next);
        onCount(group.name, next);
    }
    function remove() {
        const next = Math.max(0, count - 1);
        setCount(next);
        onCount(group.name, next);
    }
    const rows = Array.from({ length: count }, (_, index) => index);
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
    return (
        <fieldset className={styles.group}>
            <legend>{legend}</legend>
            {rows.map((index) => (
                <div className={styles.row} key={index}>
                    {group.fields.map((field) => {
                        const name = `${group.name}.${index}.${field.name}`;
                        const value = group.rows[index]?.[field.name] ?? '';
                        return (
                            <BlockFieldInput
                                key={name}
                                field={field}
                                name={name}
                                value={value}
                                labels={labels}
                            />
                        );
                    })}
                </div>
            ))}
            <div className={styles.actions}>
                <Button
                    type='button'
                    variant='secondary'
                    onClick={add}
                    disabled={count >= maximum}
                >
                    {labels.addRow}
                </Button>
                <Button
                    type='button'
                    variant='ghost'
                    onClick={remove}
                    disabled={count === 0}
                >
                    {labels.removeRow}
                </Button>
            </div>
        </fieldset>
    );
}
