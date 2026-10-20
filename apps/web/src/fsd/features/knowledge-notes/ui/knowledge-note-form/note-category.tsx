import type { ChangeEvent } from 'react';
import { Check } from 'lucide-react';
import type { KnowledgeCategory } from '@languon/contracts';
import { knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import { Checkbox } from '@/fsd/shared/ui';
import styles from './knowledge-note-form.module.css';

export function NoteCategory({
    category,
    categories,
    onChange,
    compact,
}: {
    compact: boolean;
    category: KnowledgeCategory;
    categories: KnowledgeCategory[];
    onChange(next: KnowledgeCategory[]): void;
}) {
    const { t } = useI18n();
    function change(event: ChangeEvent<HTMLInputElement>) {
        const next = event.target.checked
            ? [...categories, category]
            : categories.filter((item) => item !== category);
        onChange(next);
    }
    function toggle() {
        const next = categories.includes(category)
            ? categories.filter((item) => item !== category)
            : [...categories, category];
        onChange(next);
    }
    if (compact)
        return (
            <button
                type='button'
                className={styles.categoryChip}
                role='checkbox'
                aria-checked={categories.includes(category)}
                onClick={toggle}
            >
                <span className={styles.categoryCheck} aria-hidden>
                    {categories.includes(category) && <Check size={12} />}
                </span>
                {t(knowledgeCategoryKeys[category])}
            </button>
        );
    return (
        <Checkbox
            label={t(knowledgeCategoryKeys[category])}
            checked={categories.includes(category)}
            onChange={change}
        />
    );
}
