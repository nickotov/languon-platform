import { createElement, type HTMLAttributes } from 'react';
import styles from './heading.module.css';
export function Heading({
    level = 2,
    ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 | 3 }) {
    return createElement(`h${level}`, {
        ...props,
        className: [styles.heading, props.className].filter(Boolean).join(' '),
    });
}
