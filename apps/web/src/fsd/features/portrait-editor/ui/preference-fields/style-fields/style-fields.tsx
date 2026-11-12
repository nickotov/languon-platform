'use client';
import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import styles from '../../styles/common-common.module.css';
import type { PreferenceKey } from '../types';
import { PreferenceField } from '../preference-field/preference-field';
export function StyleFields({
    items,
    onChange,
    locale,
    disabled = false,
}: {
    items: PortraitItems;
    onChange: (items: PortraitItems) => void;
    locale: Locale;
    disabled?: boolean;
}) {
    function handleChange(field: PreferenceKey, value: string) {
        const next = { ...items };
        if (value) {
            Object.assign(next, { [field]: value });
        } else {
            delete next[field];
        }

        onChange(next);
    }

    return (
        <div className={styles.fields}>
            {(['tone', 'detail', 'wording', 'approach'] as const).map(
                (field) => (
                    <PreferenceField
                        key={field}
                        field={field}
                        value={items[field]}
                        onChange={handleChange}
                        locale={locale}
                        disabled={disabled}
                    />
                ),
            )}
        </div>
    );
}
