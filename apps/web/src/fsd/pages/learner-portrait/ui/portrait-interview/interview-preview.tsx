'use client';
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import type { PortraitItems } from '@languon/contracts';
import { Button, Dialog, IconButton } from '@/fsd/shared/ui';
import { PortraitSummaryPanel } from '@/fsd/features/portrait-editor';
import { ArrowRight, X } from 'lucide-react';
import { interviewText, type InterviewLocale } from '../../lib/interview-copy';
import { useInterviewPreviewPresence } from '../../hooks/use-interview-preview-presence';
import { countInterviewItems } from '../../lib/interview-questions';
import styles from './portrait-interview.module.css';
function PreviewContent({
    items,
    locale,
    expiresAt,
    pending,
    onClose,
    onReview,
}: {
    items: PortraitItems;
    locale: InterviewLocale;
    expiresAt: string;
    pending: number;
    onClose(): void;
    onReview(): void;
}) {
    const expiry = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
    }).format(new Date(expiresAt));
    return (
        <div className={styles.previewContent}>
            <div className={styles.previewTitle}>
                <p className={styles.eyebrow}>
                    {interviewText(locale, 'preview')}{' '}
                    <span className={styles.unsaved}>
                        {interviewText(locale, 'unsaved')}
                    </span>
                </p>
                <IconButton
                    icon={<X />}
                    label={interviewText(locale, 'dismiss')}
                    variant='ghost'
                    onClick={onClose}
                />
            </div>
            <PortraitSummaryPanel
                items={items}
                locale={locale}
                compact
                title={interviewText(locale, 'portraitSoFar')}
            />
            <dl className={styles.previewCounts}>
                <div>
                    <dt>{interviewText(locale, 'itemsCount')}</dt>
                    <dd>{countInterviewItems(items)}</dd>
                </div>
                <div>
                    <dt>{interviewText(locale, 'pendingCount')}</dt>
                    <dd>{pending}</dd>
                </div>
            </dl>
            <Button
                fullWidth
                onClick={onReview}
                trailingIcon={<ArrowRight size={16} />}
            >
                {interviewText(locale, 'review')}
            </Button>
            <p className={styles.meta}>
                {interviewText(locale, 'resumeUntil')} {expiry}.
            </p>
        </div>
    );
}
export function InterviewPreview(props: {
    items: PortraitItems;
    locale: InterviewLocale;
    expiresAt: string;
    pending: number;
    open: boolean;
    onClose(): void;
    onReview(): void;
}) {
    const [narrow, setNarrow] = useState(false);
    const present = useInterviewPreviewPresence(props.open);
    const swipe = useRef<{ y: number; time: number } | null>(null);
    function touchStart(event: TouchEvent<HTMLDivElement>) {
        const touch = event.touches[0];
        if (touch) swipe.current = { y: touch.clientY, time: Date.now() };
    }
    function touchEnd(event: TouchEvent<HTMLDivElement>) {
        const touch = event.changedTouches[0];
        const start = swipe.current;
        swipe.current = null;
        if (!touch || !start) return;
        const distance = touch.clientY - start.y;
        const elapsed = Math.max(1, Date.now() - start.time);
        if (distance > 100 || (distance > 20 && distance / elapsed > 0.5))
            props.onClose();
    }
    const sheetClass = props.open
        ? styles.previewSheet
        : [styles.previewSheet, styles.previewSheetClosing].join(' ');
    useEffect(() => {
        const query = window.matchMedia('(max-width: 1023px)');
        function update() {
            setNarrow(query.matches);
        }
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    return (
        <>
            {present ? (
                <aside className={styles.preview} data-open={props.open}>
                    <PreviewContent {...props} />
                </aside>
            ) : null}
            <div className={styles.mobilePreview}>
                <Dialog
                    variant='sheet'
                    showHeader={false}
                    className={sheetClass}
                    bodyClassName={styles.previewSheetBody}
                    title={interviewText(props.locale, 'preview')}
                    open={present && narrow}
                    onClose={props.onClose}
                >
                    <div
                        className={styles.sheetGrip}
                        onTouchStart={touchStart}
                        onTouchEnd={touchEnd}
                        aria-hidden
                    >
                        <span />
                    </div>
                    <PreviewContent {...props} />
                </Dialog>
            </div>
        </>
    );
}
