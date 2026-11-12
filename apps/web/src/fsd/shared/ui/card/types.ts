import { type HTMLAttributes, type ReactNode } from 'react';

export type CardVariant = 'elevated' | 'outlined' | 'subtle';

export type CardPadding = 'lg' | 'md' | 'none' | 'sm';

export type CardElement = 'article' | 'div' | 'li' | 'section';

export type CardProps = HTMLAttributes<HTMLElement> & {
    as?: CardElement;
    interactive?: boolean;
    padding?: CardPadding;
    variant?: CardVariant;
};

export type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
    children?: ReactNode;
};
