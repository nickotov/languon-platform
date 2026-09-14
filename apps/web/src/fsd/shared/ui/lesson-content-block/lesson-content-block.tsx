import type { ReactNode } from 'react';
import styles from './lesson-content-block.module.css';
export type LessonContentBlockMeasure = 'narrow' | 'default' | 'wide';
export type LessonContentBlockAlign = 'left' | 'center';
export interface LessonContentBlockProps {
    eyebrow?: string;
    title?: string;
    summary?: string;
    measure?: LessonContentBlockMeasure;
    align?: LessonContentBlockAlign;
    headingLevel?: 2 | 3 | 4;
    bordered?: boolean;
    className?: string;
    children?: ReactNode;
}
export function LessonContentBlock({
    eyebrow,
    title,
    summary,
    measure = 'default',
    align = 'left',
    headingLevel = 2,
    bordered = false,
    className,
    children,
}: LessonContentBlockProps) {
    const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
    return (
        <section
            className={[
                styles.root,
                styles[measure],
                styles[align],
                bordered ? styles.bordered : '',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {eyebrow || title || summary ? (
                <header>
                    <>
                        {eyebrow ? (
                            <p className={styles.eyebrow}>{eyebrow}</p>
                        ) : null}
                        {title ? <Heading>{title}</Heading> : null}
                        {summary ? (
                            <p className={styles.summary}>{summary}</p>
                        ) : null}
                    </>
                </header>
            ) : null}
            <div className={styles.body}>{children}</div>
        </section>
    );
}
