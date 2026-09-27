import { Spinner } from '@/fsd/shared/ui';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function FieldProgress({
    'aria-describedby': ariaDescribedBy,
    'aria-labelledby': ariaLabelledBy,
    field,
    message,
}: {
    'aria-describedby'?: string;
    'aria-labelledby'?: string;
    field: string;
    message: string;
}) {
    return (
        <div
            aria-describedby={ariaDescribedBy}
            aria-labelledby={ariaLabelledBy}
            className={styles.fieldProgress}
            data-testid={`ai-progress-${field}`}
            role='status'
        >
            <Spinner />
            {message}
        </div>
    );
}
