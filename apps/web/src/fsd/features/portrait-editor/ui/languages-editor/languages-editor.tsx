'use client';
import { useState, type ChangeEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PortraitItems } from '@languon/contracts';
import { Button, Checkbox, IconButton, Input, Select } from '@/fsd/shared/ui';
import type { Locale } from '@/fsd/shared/i18n';
import { LEVELS } from '../../lib/options';
import { labels, copy } from '../../lib/copy';
import { languageLabel, resolvePortraitLanguage } from '../../lib/items';
import { ChoiceChip, ShortTextInput } from '../editor-controls/editor-controls';
import styles from '../common.module.css';
type LanguageEntry = PortraitItems['languages'][number];
function LanguageRow({
    item,
    onChange,
    onRemove,
    locale,
    disabled = false,
}: {
    item: LanguageEntry;
    onChange: (item: LanguageEntry) => void;
    onRemove: (language: string) => void;
    locale: Locale;
    disabled?: boolean;
}) {
    const text = labels[locale];
    const name = languageLabel(item.language, locale);
    const removeLabel = `${text.remove}: ${name}`;
    const options = [
        {
            label: copy(
                locale,
                'No description',
                'Без описания',
                'Sans description',
                'Sin descripción',
            ),
            value: '',
        },
        ...LEVELS.map((option) => ({
            label: option.label[locale],
            value: option.value,
        })),
    ];
    function handleRemove() {
        onRemove(item.language);
    }
    function handleLevel(event: ChangeEvent<HTMLSelectElement>) {
        const level = event.target.value as LanguageEntry['level'];
        const next = { ...item };
        if (level) next.level = level;
        else delete next.level;
        onChange(next);
    }
    function handleLearning(event: ChangeEvent<HTMLInputElement>) {
        onChange({ ...item, learning: event.target.checked });
    }
    function handleClarification(value: string) {
        const next = { ...item };
        if (value) next.clarification = value;
        else delete next.clarification;
        onChange(next);
    }
    return (
        <li className={styles.language}>
            <div className={styles.row}>
                <strong>{name}</strong>
                <IconButton
                    icon={<Trash2 />}
                    label={removeLabel}
                    variant='ghost'
                    disabled={disabled}
                    onClick={handleRemove}
                />
            </div>
            <div className={styles.grid}>
                <Select
                    label={text.level}
                    options={options}
                    value={item.level ?? ''}
                    onChange={handleLevel}
                    disabled={disabled}
                />
                <Checkbox
                    label={text.learning}
                    checked={item.learning}
                    onChange={handleLearning}
                    disabled={disabled}
                />
            </div>
            <ShortTextInput
                label={text.clarification}
                placeholder={copy(
                    locale,
                    'e.g., I read comfortably but struggle to speak.',
                    'Например, читаю свободно, но говорить трудно.',
                    'Ex. : Je lis facilement mais j’ai du mal à parler.',
                    'P. ej., leo con facilidad pero me cuesta hablar.',
                )}
                value={item.clarification ?? ''}
                locale={locale}
                onChange={handleClarification}
                disabled={disabled}
            />
        </li>
    );
}
export function LanguagesEditor({
    languages,
    onChange,
    locale,
    disabled = false,
}: {
    languages: LanguageEntry[];
    onChange: (items: LanguageEntry[]) => void;
    locale: Locale;
    disabled?: boolean;
}) {
    const [custom, setCustom] = useState('');
    const atLimit = languages.length >= 30;
    const customCode = resolvePortraitLanguage(custom, locale);
    const valid = Boolean(customCode);
    const duplicate = languages.some(
        (item) => item.language.toLowerCase() === customCode?.toLowerCase(),
    );
    const suggestions = ['en', 'es', 'fr', 'ru', 'de', 'it', 'pt', 'ja'].filter(
        (code) =>
            !languages.some((item) => item.language.toLowerCase() === code),
    );
    function handleAdd(code: string) {
        if (atLimit) return;
        onChange([...languages, { language: code, learning: false }]);
    }
    function handleCustomAdd() {
        if (!valid || duplicate || disabled) return;
        if (customCode) handleAdd(customCode);
        setCustom('');
    }
    function handleCustomChange(event: ChangeEvent<HTMLInputElement>) {
        setCustom(event.target.value);
    }
    function handleUpdate(next: LanguageEntry) {
        onChange(
            languages.map((item) =>
                item.language === next.language ? next : item,
            ),
        );
    }
    function handleRemove(code: string) {
        onChange(languages.filter((item) => item.language !== code));
    }
    const label = copy(
        locale,
        'Another language',
        'Другой язык',
        'Une autre langue',
        'Otro idioma',
    );
    const selfReported = copy(
        locale,
        'Levels are your own description, not an assessment. Leave any of them blank.',
        'Уровни — ваше описание, а не оценка. Их можно не указывать.',
        'Les niveaux sont votre description, pas une évaluation. Vous pouvez les laisser vides.',
        'Los niveles son tu descripción, no una evaluación. Puedes dejarlos en blanco.',
    );
    const emptyText = copy(
        locale,
        'No languages yet.',
        'Языки пока не добавлены.',
        'Aucune langue pour le moment.',
        'Todavía no hay idiomas.',
    );
    return (
        <div className={styles.stack}>
            <p className={styles.description}>{selfReported}</p>
            {languages.length === 0 && (
                <p className={styles.emptyLanguages}>{emptyText}</p>
            )}
            {languages.length > 0 && (
                <ul className={styles.list}>
                    {languages.map((item) => (
                        <LanguageRow
                            key={item.language}
                            item={item}
                            onChange={handleUpdate}
                            onRemove={handleRemove}
                            locale={locale}
                            disabled={disabled}
                        />
                    ))}
                </ul>
            )}
            {!atLimit && (
                <>
                    <div className={styles.chips}>
                        {suggestions.map((code) => (
                            <ChoiceChip
                                key={code}
                                value={code}
                                label={languageLabel(code, locale)}
                                selected={false}
                                onToggle={handleAdd}
                                disabled={disabled}
                            />
                        ))}
                    </div>
                    <div className={styles.inline}>
                        <Input
                            label={label}
                            placeholder={copy(
                                locale,
                                'e.g., Catalan',
                                'Например, каталанский',
                                'Ex. : catalan',
                                'P. ej., catalán',
                            )}
                            wrapperClassName={styles.grow}
                            value={custom}
                            onChange={handleCustomChange}
                            disabled={disabled}
                        />
                        <Button
                            type='button'
                            variant='secondary'
                            className={styles.addButton}
                            leadingIcon={<Plus className={styles.icon} />}
                            disabled={disabled || !valid || duplicate}
                            onClick={handleCustomAdd}
                        >
                            {labels[locale].add}
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
