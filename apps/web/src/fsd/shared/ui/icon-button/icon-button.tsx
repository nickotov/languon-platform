import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ControlSize } from '../button/button';
import styles from './icon-button.module.css';
export function IconButton({
    children,
    label,
    size = 'small',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    label: string;
    size?: ControlSize;
}) {
    return (
        <button
            {...props}
            aria-label={label}
            className={[styles.button, styles[size], props.className]
                .filter(Boolean)
                .join(' ')}
        >
            {children}
        </button>
    );
}
