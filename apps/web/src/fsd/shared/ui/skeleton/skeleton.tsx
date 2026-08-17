import styles from './skeleton.module.css';
export function Skeleton({ height = 16 }: { height?: number }) {
    return (
        <span
            aria-hidden='true'
            className={styles.skeleton}
            style={{ height }}
        />
    );
}
