'use client';
import { interviewText, type InterviewLocale } from '../../lib/interview-copy';
import { Button, Dialog, DialogActions } from '@/fsd/shared/ui';
export function InterviewCostNotice({
    locale,
    open,
    onClose,
    onConfirm,
}: {
    locale: InterviewLocale;
    open: boolean;
    onClose(): void;
    onConfirm(): void;
}) {
    return (
        <Dialog
            title={interviewText(locale, 'paidNoticeTitle')}
            description={interviewText(locale, 'paidNoticeDescription')}
            size='sm'
            open={open}
            onClose={onClose}
            footer={
                <DialogActions>
                    <Button variant='secondary' onClick={onClose}>
                        {interviewText(locale, 'notNow')}
                    </Button>
                    <Button onClick={onConfirm}>
                        {interviewText(locale, 'continuePaid')}
                    </Button>
                </DialogActions>
            }
        >
            <p>
                {interviewText(locale, 'paidNoticeBody')}{' '}
                {interviewText(locale, 'pinnedPolicy')}
            </p>
        </Dialog>
    );
}
