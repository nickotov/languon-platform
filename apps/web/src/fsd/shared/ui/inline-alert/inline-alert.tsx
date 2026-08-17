import { forwardRef, type ReactNode } from 'react';
import styles from './inline-alert.module.css';
export const InlineAlert = forwardRef<
    HTMLDivElement,
    { children: ReactNode; tone?: 'danger' | 'info' | 'success' | 'warning' }
>(function InlineAlert({ children, tone = 'info' }, ref) {
    return (
        <div
            className={[styles.alert, styles[tone]].join(' ')}
            ref={ref}
            role={tone === 'danger' ? 'alert' : 'status'}
            tabIndex={tone === 'danger' ? -1 : undefined}
        >
            {children}
        </div>
    );
});
