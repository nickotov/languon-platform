import styles from './progress.module.css';
export function Progress({ label, value }: { label: string; value: number }) {
    return (
        <progress
            aria-label={label}
            className={styles.progress}
            max={100}
            value={value}
        >
            {value}%
        </progress>
    );
}
