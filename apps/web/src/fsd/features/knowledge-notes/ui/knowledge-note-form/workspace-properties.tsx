'use client';

import { useState, type ReactNode } from 'react';
import { Languages, Plus, Tags, Text } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Popover, PopoverTrigger, PopoverContent } from '@/fsd/shared/ui';
import styles from './knowledge-note-form.module.css';

export function WorkspaceProperties({
    languages,
    categories,
    summary,
    languageFields,
    categoryFields,
    summaryField,
}: {
    languages: string;
    categories: string;
    summary: string;
    languageFields: ReactNode;
    categoryFields: ReactNode;
    summaryField: ReactNode;
}) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(false);
    function expand() {
        setExpanded(true);
    }
    const empty = !languages && !categories && !summary.trim();
    if (empty && !expanded)
        return (
            <button
                type='button'
                className={styles.addProperties}
                onClick={expand}
            >
                <Plus size={14} aria-hidden />
                {t('knowledge.addProperties')}
            </button>
        );
    return (
        <div
            role='group'
            aria-label={t('knowledge.properties')}
            className={styles.properties}
        >
            <Property
                kind='languages'
                label={languages || t('knowledge.languages')}
                filled={Boolean(languages)}
                icon={<Languages size={14} aria-hidden />}
            >
                {languageFields}
            </Property>
            <Property
                kind='categories'
                label={categories || t('knowledge.categories')}
                filled={Boolean(categories)}
                icon={<Tags size={14} aria-hidden />}
            >
                {categoryFields}
            </Property>
            <Property
                kind='summary'
                label={summary || t('knowledge.summary')}
                filled={Boolean(summary)}
                icon={<Text size={14} aria-hidden />}
            >
                {summaryField}
            </Property>
        </div>
    );
}

function Property({
    kind,
    label,
    filled,
    icon,
    children,
}: {
    kind: 'languages' | 'categories' | 'summary';
    label: string;
    filled: boolean;
    icon: ReactNode;
    children: ReactNode;
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type='button'
                    className={styles.property}
                    data-filled={filled}
                >
                    {icon}
                    <span>{label}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent
                side='bottom'
                align='start'
                className={styles.propertyPopover}
                data-property-kind={kind}
            >
                {children}
            </PopoverContent>
        </Popover>
    );
}
