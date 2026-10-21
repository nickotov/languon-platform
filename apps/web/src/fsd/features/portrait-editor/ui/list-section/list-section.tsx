'use client';
import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import type { Option } from '../../lib/options';
import { listCopy } from '../../lib/list-copy';
import { toggleItem } from '../../lib/items';
import {
    ChoiceChip,
    CustomEntryList,
} from '../editor-controls/editor-controls';
import styles from '../common.module.css';
type ListKey = 'goals' | 'accommodations' | 'hobbies';
export function ListSection({
    field,
    items,
    onChange,
    options,
    locale,
    disabled = false,
}: {
    field: ListKey;
    items: PortraitItems;
    onChange: (items: PortraitItems) => void;
    options: Option<string>[];
    locale: Locale;
    disabled?: boolean;
}) {
    const text = listCopy(field, locale);
    const selected = items[field];
    const max = 12;
    const suggested = options.flatMap((option) => Object.values(option.label));
    const custom = selected.filter((value) => !suggested.includes(value));
    function handleToggle(value: string) {
        onChange({ ...items, [field]: toggleItem(selected, value) });
    }
    function handleCustomChange(values: string[]) {
        const kept = selected.filter((value) => suggested.includes(value));
        onChange({ ...items, [field]: [...kept, ...values] });
    }
    const remainingMax = max - (selected.length - custom.length);
    return (
        <>
            <div role='group' aria-label={text.legend}>
                <p className={styles.legend}>{text.legend}</p>
                <div className={styles.chips}>
                    {options.map((option) => {
                        const existing = selected.find((entry) =>
                            Object.values(option.label).includes(entry),
                        );
                        const value = existing ?? option.label[locale];
                        const isSelected = existing !== undefined;
                        const isDisabled =
                            disabled || (!isSelected && selected.length >= max);
                        return (
                            <ChoiceChip
                                key={option.value}
                                value={value}
                                label={option.label[locale]}
                                selected={isSelected}
                                onToggle={handleToggle}
                                disabled={isDisabled}
                            />
                        );
                    })}
                </div>
            </div>
            <CustomEntryList
                label={text.label}
                placeholder={text.placeholder}
                entries={custom}
                onChange={handleCustomChange}
                locale={locale}
                disabled={disabled}
                max={remainingMax}
            />
        </>
    );
}
