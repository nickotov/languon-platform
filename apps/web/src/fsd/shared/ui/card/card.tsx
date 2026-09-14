import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import styles from './card.module.css';

export type CardVariant = 'elevated' | 'outlined' | 'subtle';
export type CardPadding = 'lg' | 'md' | 'none' | 'sm';
export type CardElement = 'article' | 'div' | 'li' | 'section';
export type CardProps = HTMLAttributes<HTMLElement> & {
    as?: CardElement;
    interactive?: boolean;
    padding?: CardPadding;
    variant?: CardVariant;
};

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

export type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
    children?: ReactNode;
};
export function CardHeader({ className, ...props }: CardSectionProps) {
    return (
        <div
            {...props}
            className={[styles.header, className].filter(Boolean).join(' ')}
        />
    );
}
export function CardTitle({
    className,
    ...props
}: HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3
            {...props}
            className={[styles.title, className].filter(Boolean).join(' ')}
        />
    );
}
export function CardDescription({
    className,
    ...props
}: HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p
            {...props}
            className={[styles.description, className]
                .filter(Boolean)
                .join(' ')}
        />
    );
}
export function CardContent({ className, ...props }: CardSectionProps) {
    return (
        <div
            {...props}
            className={[styles.content, className].filter(Boolean).join(' ')}
        />
    );
}
export function CardFooter({ className, ...props }: CardSectionProps) {
    return (
        <div
            {...props}
            className={[styles.footer, className].filter(Boolean).join(' ')}
        />
    );
}
