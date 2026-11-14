import type {
    ExerciseActivityId,
    ExerciseActivityMetadata,
} from '@languon/contracts';
import { Checkbox } from '@/fsd/shared/ui';
import type { Locale } from '@/fsd/shared/i18n';
import { exerciseCheckingLabel } from '@/fsd/entities/learning-blocks';
import styles from './activity-options.module.css';

function ActivityOption({
    activity,
    selected,
    order,
    locale,
    exampleLabel,
    onToggle,
}: {
    activity: ExerciseActivityMetadata;
    selected: boolean;
    order: number;
    locale: Locale;
    exampleLabel: string;
    onToggle(id: ExerciseActivityId): void;
}) {
    const display = activity.locales[locale];
    const label = order > 0 ? `${order}. ${display.name}` : display.name;
    const description = `${display.description} ${exerciseCheckingLabel(activity.checkingPolicy, locale)}.`;

    function toggle() {
        onToggle(activity.id);
    }

    return (
        <div className={styles.option}>
            <Checkbox
                checked={selected}
                onChange={toggle}
                label={label}
                description={description}
            />
            <details className={styles.example}>
                <summary>{exampleLabel}</summary>
                <p dir='auto'>{display.example}</p>
            </details>
        </div>
    );
}

export function ActivityOptions({
    activities,
    selected,
    locale,
    categories,
    exampleLabel,
    onToggle,
}: {
    activities: readonly ExerciseActivityMetadata[];
    selected: ExerciseActivityId[];
    locale: Locale;
    categories: Record<ExerciseActivityMetadata['category'], string>;
    exampleLabel: string;
    onToggle(id: ExerciseActivityId): void;
}) {
    function render(activity: ExerciseActivityMetadata) {
        const order = selected.indexOf(activity.id) + 1;

        return (
            <ActivityOption
                key={activity.id}
                activity={activity}
                selected={order > 0}
                order={order}
                locale={locale}
                exampleLabel={exampleLabel}
                onToggle={onToggle}
            />
        );
    }

    function renderCategory(category: ExerciseActivityMetadata['category']) {
        const items = activities.filter(
            (activity) => activity.category === category,
        );

        if (!items.length) {
            return null;
        }

        return (
            <fieldset key={category} className={styles.group}>
                <legend>{categories[category]}</legend>
                {items.map(render)}
            </fieldset>
        );
    }

    return (
        <div className={styles.options}>
            {(['vocabulary', 'grammar', 'reading', 'writing'] as const).map(
                renderCategory,
            )}
        </div>
    );
}
