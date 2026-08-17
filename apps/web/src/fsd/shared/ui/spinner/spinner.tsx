import styles from './spinner.module.css';
export function Spinner({ label }: { label?: string }) {
    return (
        <span
            aria-label={label}
            className={styles.spinner}
            role={label ? 'status' : undefined}
        />
    );
}
