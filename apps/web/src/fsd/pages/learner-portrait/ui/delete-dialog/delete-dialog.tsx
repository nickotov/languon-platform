import { useState } from 'react';
import { portraitApi } from '@/fsd/entities/learner-portrait';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    InlineAlert,
    showToast,
} from '@/fsd/shared/ui';
import type { PortraitManagement } from '../../hooks/use-portrait-management';
import { portraitCopy } from '../../lib/copy';
import styles from '../common.module.css';

export function DeletePortraitDialog({
    open,
    onClose,
    management,
}: {
    open: boolean;
    onClose(): void;
    management: PortraitManagement;
}) {
    const { locale } = useI18n();
    const [failed, setFailed] = useState(false);
    function close() {
        if (!management.pending) {
            setFailed(false);
            onClose();
        }
    }
    async function confirm() {
        const version = management.query.data?.version;
        if (version === undefined) return;
        const result = await management.apply((token) =>
            portraitApi.remove(token, {
                expectedVersion: version,
                confirmed: true,
            }),
        );
        if (result) {
            setFailed(false);
            showToast({
                tone: 'success',
                content: portraitCopy(locale, 'deleted'),
                dismissLabel: portraitCopy(locale, 'dismiss'),
            });
            onClose();
        } else setFailed(true);
    }
    return (
        <Dialog
            open={open}
            onClose={close}
            size='sm'
            title={portraitCopy(locale, 'deleteTitle')}
            description={portraitCopy(locale, 'irreversible')}
            dismissible={!management.pending}
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        onClick={close}
                        disabled={management.pending}
                    >
                        {portraitCopy(locale, 'cancel')}
                    </Button>
                    <Button
                        variant='danger'
                        onClick={confirm}
                        loading={management.pending}
                    >
                        {portraitCopy(locale, 'delete')}
                    </Button>
                </DialogActions>
            }
        >
            <ul className={styles.list}>
                {(
                    [
                        'delSaved',
                        'delUnfinished',
                        'delStops',
                        'delChats',
                    ] as const
                ).map((key) => (
                    <li key={key}>{portraitCopy(locale, key)}</li>
                ))}
            </ul>
            <p className={styles.small}>
                {portraitCopy(locale, 'pauseInstead')}
            </p>
            {failed && (
                <InlineAlert tone='error'>
                    {portraitCopy(locale, 'actionError')}
                </InlineAlert>
            )}
        </Dialog>
    );
}
