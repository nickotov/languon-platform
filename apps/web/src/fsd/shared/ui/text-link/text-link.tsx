import type { AnchorHTMLAttributes } from 'react';
import styles from './text-link.module.css';
export function TextLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
    return (
        <a
            {...props}
            className={[styles.link, props.className].filter(Boolean).join(' ')}
        />
    );
}
