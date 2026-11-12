import { createElement } from 'react';
import styles from '../styles/card-common.module.css';
import type { CardProps } from './types';

export function Card({
    as = 'section',
    className,
    interactive = false,
    padding = 'md',
    variant = 'elevated',
    ...props
}: CardProps) {
    return createElement(as, {
        ...props,
        className: [
            styles.card,
            styles[variant],
            styles[`padding-${padding}`],
            interactive ? styles.interactive : undefined,
            className,
        ]
            .filter(Boolean)
            .join(' '),
        tabIndex:
            interactive && props.tabIndex === undefined ? 0 : props.tabIndex,
    });
}
