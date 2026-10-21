import { useId, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { PortraitItems } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Radio, RadioGroup } from '@/fsd/shared/ui';
import { portraitCopy } from '../../lib/copy';
import {
    changedPortraitFields,
    portraitFieldLabel,
    reconcilePortraitItems,
    type PortraitConflictChoices,
    type PortraitConflictChoice,
    type PortraitField,
} from '../../lib/reconciliation';
import { conflictFieldValue } from './field-value';
import styles from './conflict-panel.module.css';

export function ConflictPanel({
    latest,
    draft,
    onReconcile,
}: {
    latest: PortraitItems;
    draft: PortraitItems;
    onReconcile(items: PortraitItems): void;
}) {
    const { locale } = useI18n();
    const headingId = useId();
    const [choices, setChoices] = useState<PortraitConflictChoices>({});
    const fields = changedPortraitFields(latest, draft);
    const ready = fields.every((field) => choices[field]);
    function choose(field: PortraitField, choice: PortraitConflictChoice) {
        setChoices((current) => ({ ...current, [field]: choice }));
    }
    function apply() {
        const result = reconcilePortraitItems(latest, draft, choices);
        if (result) onReconcile(result);
    }
    return (
        <section className={styles.panel} aria-labelledby={headingId}>
            <div className={styles.heading}>
                <RefreshCw aria-hidden size={20} />
                <div>
                    <h2 className={styles.title} id={headingId}>
                        {portraitCopy(locale, 'conflict')}
                    </h2>
                    <p className={styles.body}>
                        {portraitCopy(locale, 'conflictBody')}
                    </p>
                </div>
            </div>
            <div className={styles.fields}>
                {fields.map((field) => (
                    <ConflictField
                        key={field}
                        field={field}
                        latest={latest}
                        draft={draft}
                        choice={choices[field]}
                        onChoose={choose}
                    />
                ))}
            </div>
            <div className={styles.actions}>
                <Button onClick={apply} disabled={!ready}>
                    {portraitCopy(locale, 'reconcile')}
                </Button>
                {!ready && <p>{portraitCopy(locale, 'chooseAll')}</p>}
            </div>
        </section>
    );
}

function ConflictField({
    field,
    latest,
    draft,
    choice,
    onChoose,
}: {
    field: PortraitField;
    latest: PortraitItems;
    draft: PortraitItems;
    choice: PortraitConflictChoice | undefined;
    onChoose(field: PortraitField, choice: PortraitConflictChoice): void;
}) {
    const { locale } = useI18n();
    function change(value: string) {
        if (value === 'saved' || value === 'draft') onChoose(field, value);
    }
    const latestValue = conflictFieldValue(latest, field, locale);
    const draftValue = conflictFieldValue(draft, field, locale);
    return (
        <div className={styles.field}>
            <RadioGroup
                className={styles.choices ?? ''}
                label={portraitFieldLabel(locale, field)}
                value={choice ?? ''}
                onChange={change}
                variant='card'
                size='sm'
            >
                <Radio value='saved'>
                    {portraitCopy(locale, 'latest')}: {latestValue}
                </Radio>
                <Radio value='draft'>
                    {portraitCopy(locale, 'proposed')}: {draftValue}
                </Radio>
            </RadioGroup>
        </div>
    );
}
