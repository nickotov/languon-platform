'use client';

import {
    type InputHTMLAttributes,
    type ReactNode,
    useEffect,
    useRef,
} from 'react';
import styles from './checkbox.module.css';
export function Checkbox({
    children,
    indeterminate = false,
    ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    children: ReactNode;
    indeterminate?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
        <label className={styles.choice}>
            <input
                {...props}
                aria-checked={indeterminate ? 'mixed' : props['aria-checked']}
                ref={inputRef}
                type='checkbox'
            />
            <span>{children}</span>
        </label>
    );
}
