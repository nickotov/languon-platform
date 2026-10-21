import { useRouter } from 'next/navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, DialogActions, InlineAlert } from '@/fsd/shared/ui';
import type { PortraitManagement } from '../../hooks/use-portrait-management';
import { portraitCopy } from '../../lib/copy';

export function DiscardInterviewDialog({
    open,
    onClose,
    management,
}: {
    open: boolean;
    onClose(): void;
    management: PortraitManagement;
}) {
    const { locale } = useI18n();
    const router = useRouter();
    async function discard() {
        const result = await management.discard();
        if (result) router.push('/portrait');
    }
    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={portraitCopy(locale, 'discardTitle')}
            description={portraitCopy(locale, 'discardBody')}
            size='sm'
            dismissible={!management.pending}
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        onClick={onClose}
                        disabled={management.pending}
                    >
                        {portraitCopy(locale, 'keep')}
                    </Button>
                    <Button
                        variant='danger'
                        onClick={discard}
                        loading={management.pending}
                    >
                        {portraitCopy(locale, 'discard')}
                    </Button>
                </DialogActions>
            }
        >
            {Boolean(management.error) && (
                <InlineAlert tone='error'>
                    {portraitCopy(locale, 'actionError')}
                </InlineAlert>
            )}
        </Dialog>
    );
}
