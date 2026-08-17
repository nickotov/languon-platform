import type { TextareaHTMLAttributes } from 'react';
import styles from './textarea.module.css';
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[styles.textarea, props.className]
                .filter(Boolean)
                .join(' ')}
        />
    );
}
