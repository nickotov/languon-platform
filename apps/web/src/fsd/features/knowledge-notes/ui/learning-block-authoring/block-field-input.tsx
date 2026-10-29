'use client';

import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Input, Textarea } from '@/fsd/shared/ui';
import type { BlockField } from '../../lib/learning-block-form';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';

export type BlockFieldEnhancement = (field: {
    name: string;
    value: string;
    onAccept(value: string): void;
}) => ReactNode;

export function BlockFieldInput({
    field,
    name,
    value,
    labels,
    enhance,
    onValueChange,
}: {
    field: BlockField;
    name?: string;
    value?: string;
    labels: BlockAuthoringLabels;
    enhance?: BlockFieldEnhancement | undefined;
    onValueChange?: ((value: string) => void) | undefined;
}) {
    const label = labels.field(field.label);
    const inputName = name ?? field.name;
    const [current, setCurrent] = useState(value ?? field.value ?? '');
    function change(
        event: ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
    ) {
        setCurrent(event.currentTarget.value);
        onValueChange?.(event.currentTarget.value);
    }
    function acceptValue(value: string) {
        setCurrent(value);
        onValueChange?.(value);
    }
    const enhanced = enhance?.({
        name: inputName,
        value: current,
        onAccept: acceptValue,
    });
    let control;
    if (field.name === 'format') {
        control = (
            <label className={styles.field}>
                {label}
                <select name={inputName} value={current} onChange={change}>
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
    } else if (field.multiline) {
        control = (
            <Textarea
                name={inputName}
                label={label}
                value={current}
                onChange={change}
                rows={3}
            />
        );
    } else {
        control = (
            <Input
                name={inputName}
                label={label}
                value={current}
                onChange={change}
                autoFocus={field.name === 'title'}
                size='sm'
            />
        );
    }
    return (
        <div className={styles.fieldControl}>
            {control}
            {enhanced}
        </div>
    );
}
