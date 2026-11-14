import type { ChangeEvent } from 'react';
import type {
    ExerciseActivityId,
    ExerciseActivityMetadata,
} from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import { Button, Input } from '@/fsd/shared/ui';
import type { exerciseGenerationCopy } from '../../../../lib/exercise-generation-copy';
import styles from './activity-distribution.module.css';

export function ActivityDistribution({
    allocations,
    activities,
    locale,
    labels,
    onChange,
    onDistribute,
}: {
    allocations: { activityId: ExerciseActivityId; count: number }[];
    activities: readonly ExerciseActivityMetadata[];
    locale: Locale;
    labels: ReturnType<typeof exerciseGenerationCopy>;
    onChange(id: ExerciseActivityId, count: string): void;
    onDistribute(): void;
}) {
    function render(allocation: {
        activityId: ExerciseActivityId;
        count: number;
    }) {
        const activity = activities.find(
            (item) => item.id === allocation.activityId,
        );

        function change(event: ChangeEvent<HTMLInputElement>) {
            onChange(allocation.activityId, event.target.value);
        }

        return (
            <Input
                key={allocation.activityId}
                label={`${labels.activityCount}: ${activity?.locales[locale].name ?? allocation.activityId}`}
                type='number'
                min={1}
                max={25}
                step={1}
                value={allocation.count}
                onChange={change}
            />
        );
    }

    return (
        <details>
            <summary>{labels.distribution}</summary>
            <div className={styles.fields}>
                {allocations.map(render)}
                <Button type='button' variant='ghost' onClick={onDistribute}>
                    {labels.distribute}
                </Button>
            </div>
        </details>
    );
}
