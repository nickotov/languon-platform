import {
    AlertTriangleIcon,
    BookOpenIcon,
    LightbulbIcon,
    SparklesIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './grammar-callout.module.css';
export type GrammarCalloutVariant = 'rule' | 'tip' | 'warning' | 'example';
export interface GrammarCalloutProps {
    title?: string;
    children: ReactNode;
    variant?: GrammarCalloutVariant;
    eyebrow?: string;
    hideIcon?: boolean;
    className?: string;
}
const data = {
    rule: { Icon: BookOpenIcon, label: 'Grammar rule' },
    tip: { Icon: LightbulbIcon, label: 'Tip' },
    warning: { Icon: AlertTriangleIcon, label: 'Common mistake' },
    example: { Icon: SparklesIcon, label: 'Example' },
};
export function GrammarCallout({
    title,
    children,
    variant = 'rule',
    eyebrow,
    hideIcon = false,
    className,
}: GrammarCalloutProps) {
    const { Icon, label } = data[variant];
    return (
        <aside
            role='note'
            className={[styles.root, styles[variant], className]
                .filter(Boolean)
                .join(' ')}
        >
            <span className={styles.accent} aria-hidden='true' />
            {!hideIcon ? (
                <Icon className={styles.icon} aria-hidden='true' />
            ) : null}
            <div className={styles.content}>
                {(eyebrow ?? label) ? (
                    <p className={styles.eyebrow}>{eyebrow ?? label}</p>
                ) : null}
                {title ? <h3>{title}</h3> : null}
                <div className={styles.body}>{children}</div>
            </div>
        </aside>
    );
}
