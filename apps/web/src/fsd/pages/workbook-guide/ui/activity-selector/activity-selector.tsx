'use client';

import type { ChangeEvent } from 'react';
import type { Locale } from '@/fsd/shared/i18n';
import { Select } from '@/fsd/shared/ui';
import type { GuideActivity } from '../../lib/examples';
import { guideUiCopy } from '../copy';

const categories = ['vocabulary', 'grammar', 'reading', 'writing'] as const;
export function ActivitySelector({
    locale,
    activities,
    selected,
    onSelect,
}: {
    locale: Locale;
    activities: GuideActivity[];
    selected: string;
    onSelect: (id: string) => void;
}) {
    const copy = guideUiCopy(locale);
    const groups = categories.map((category, index) => ({
        label: copy.categories[index]!,
        options: activities
            .filter((item) => item.activity.category === category)
            .map((item) => ({
                value: item.activity.id,
                label: `${item.activity.id} · ${item.activity.locales[locale].name}`,
            })),
    }));

    function handleChange(event: ChangeEvent<HTMLSelectElement>) {
        onSelect(event.target.value);
    }

    return (
        <Select
            label={copy.activity}
            value={selected}
            groups={groups}
            onChange={handleChange}
        />
    );
}
