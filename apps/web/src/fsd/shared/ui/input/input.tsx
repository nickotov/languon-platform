import type { InputHTMLAttributes } from 'react';

import type { ControlSize } from '../button/button';
import styles from './input.module.css';

export function Input({
    className,
    controlSize = 'medium',
    ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    controlSize?: ControlSize;
}) {
    return (
        <input
            {...props}
            className={[styles.input, styles[controlSize], className]
                .filter(Boolean)
                .join(' ')}
        />
    );
}
