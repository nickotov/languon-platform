import type { ChangeEvent } from 'react';
import type { ChatPreferences } from '@languon/contracts';
import { Badge, Button, Select } from '@/fsd/shared/ui';
import {
    inheritPortraitField,
    type PortraitField,
} from '../../lib/portrait-preferences';
import type { portraitSettingsCopy } from '../../lib/portrait-settings-copy';
import styles from './conversation-preferences.module.css';

export function PreferenceField({
    field,
    value,
    onChange,
    disabled,
    origin,
    showSource,
    resettable,
    copy,
}: {
    field: {
        key: PortraitField;
        label: string;
        value: string;
        options: { value: string; label: string }[];
    };
    value: ChatPreferences;
    onChange(value: ChatPreferences): void;
    disabled: boolean;
    origin: 'manual' | 'portrait';
    showSource: boolean;
    resettable: boolean;
    copy: ReturnType<typeof portraitSettingsCopy>;
}) {
    function change(event: ChangeEvent<HTMLSelectElement>) {
        const selected = event.target.value;
        const optionalField = ['detail', 'wording', 'approach'].includes(
            field.key,
        );
        const nextValue =
            optionalField && selected === 'auto' ? undefined : selected;
        onChange({ ...value, [field.key]: nextValue });
    }
    function reset() {
        onChange(inheritPortraitField(value, field.key));
    }
    const canReset = showSource && origin === 'manual' && resettable;
    return (
        <div className={styles.field}>
            {showSource && (
                <div className={styles.source}>
                    <span>{copy.source}</span>
                    <Badge
                        tone={origin === 'portrait' ? 'info' : 'neutral'}
                        size='sm'
                    >
                        {origin === 'portrait' ? copy.portrait : copy.manual}
                    </Badge>
                </div>
            )}
            <Select
                label={field.label}
                value={field.value}
                options={field.options}
                onChange={change}
                disabled={disabled}
            />
            {canReset && (
                <Button
                    variant='ghost'
                    size='compact'
                    onClick={reset}
                    disabled={disabled}
                >
                    {copy.reset}
                </Button>
            )}
        </div>
    );
}
