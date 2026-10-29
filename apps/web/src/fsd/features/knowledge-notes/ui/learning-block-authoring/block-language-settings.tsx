'use client';
import { useState, type RefObject, type SyntheticEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import type { BlockField } from '../../lib/learning-block-form';
import { BlockFieldInput } from './block-form-fields';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';

/** Existing language settings stay editable behind the prototype’s quiet language-pair line. */
export function BlockLanguageSettings({
    fields,
    labels,
    form,
    revision,
    initialOpen,
}: {
    fields: BlockField[];
    labels: BlockAuthoringLabels;
    form: RefObject<HTMLFormElement | null>;
    revision: number;
    initialOpen: boolean;
}) {
    const { locale } = useI18n();
    const [open, setOpen] = useState(initialOpen);
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    function display(field: BlockField) {
        const input = form.current?.elements.namedItem(field.name);
        const value =
            input instanceof HTMLInputElement
                ? input.value
                : (field.value ?? '');
        try {
            return names.of(value) || value;
        } catch {
            return value;
        }
    }
    const pair = fields.map(display).filter(Boolean).join(' → ');
    const label = `${labels.field('Languages')}: ${pair}`;
    function toggle(event: SyntheticEvent<HTMLDetailsElement>) {
        setOpen(event.currentTarget.open);
    }
    return (
        <details
            className={styles.languageSettings}
            open={open}
            onToggle={toggle}
        >
            <summary
                role='button'
                aria-label={label}
                aria-expanded={open}
                className={styles.languageSummary}
            >
                {pair || labels.field('Languages')}
                <ChevronDown size={12} aria-hidden />
            </summary>
            <div className={styles.languageFields}>
                {fields.map((field) => (
                    <BlockFieldInput
                        key={`${field.name}-${revision}`}
                        field={field}
                        labels={labels}
                    />
                ))}
            </div>
        </details>
    );
}
