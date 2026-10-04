'use client';

import type { AccountDeletionScheduleResponse } from '@languon/contracts';
import { useState, type FormEvent } from 'react';

import { AuthApiError, authApi } from '@/fsd/shared/api/auth-api';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    InlineAlert,
    Input,
} from '@/fsd/shared/ui';

import styles from './account-controls.module.css';

export function AccountDeletionAction({
    className,
    onScheduled,
    requestWithSession,
}: {
    className?: string | undefined;
    onScheduled(receipt: AccountDeletionScheduleResponse): void;
    requestWithSession<T>(
        operation: (accessToken: string) => Promise<T>,
    ): Promise<T>;
}) {
    const { t } = useI18n();

    const [open, setOpen] = useState(false);

    const [confirmation, setConfirmation] = useState('');

    const [acknowledged, setAcknowledged] = useState(false);

    const [pending, setPending] = useState(false);

    const [error, setError] = useState<string | null>(null);

    function close() {
        if (!pending) {
            setOpen(false);

            setConfirmation('');

            setAcknowledged(false);

            setError(null);
        }
    }

    async function schedule(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (confirmation !== 'DELETE' || !acknowledged || pending) return;

        setPending(true);

        setError(null);

        try {
            const receipt = await requestWithSession((token) =>
                authApi.scheduleAccountDeletion(token),
            );

            onScheduled(receipt);

            setOpen(false);
        } catch (caught) {
            if (caught instanceof AuthApiError) {
                if (caught.status === 401 || caught.status === 403)
                    setError(t('profile.deleteRecentAuth'));
                else if (caught.detail.code === 'owner_transfer_required')
                    setError(t('profile.deleteOwnerTransfer'));
                else if (caught.status === 409)
                    setError(t('profile.deleteConflict'));
                else setError(t('profile.deleteFailed'));
            } else setError(t('profile.deleteFailed'));
        } finally {
            setPending(false);
        }
    }

    return (
        <>
            <Button
                className={className}
                onClick={() => setOpen(true)}
                size='compact'
                variant='danger'
            >
                {t('profile.deleteAccount')}
            </Button>
            <Dialog
                bodyClassName={styles.deletionBody}
                className={styles.deletionDialog ?? ''}
                closeLabel={t('profile.dismiss')}
                dismissible={!pending}
                onClose={close}
                open={open}
                role='alertdialog'
                showCloseButton={!pending}
                size='md'
                title={t('profile.deleteConfirmTitle')}
                footer={
                    <DialogActions>
                        <Button
                            disabled={pending}
                            onClick={close}
                            type='button'
                            variant='quiet'
                        >
                            {t('profile.deleteKeep')}
                        </Button>
                        <Button
                            disabled={
                                pending ||
                                confirmation !== 'DELETE' ||
                                !acknowledged
                            }
                            form='profile-account-deletion-confirmation'
                            type='submit'
                            variant='danger'
                        >
                            {t(
                                pending
                                    ? 'profile.deletePending'
                                    : 'profile.deleteConfirmAction',
                            )}
                        </Button>
                    </DialogActions>
                }
            >
                <form
                    className={styles.confirmForm}
                    id='profile-account-deletion-confirmation'
                    onSubmit={schedule}
                >
                    <p>{t('profile.deleteConfirmDescription')}</p>
                    <InlineAlert
                        className={styles.lossAlert ?? ''}
                        title={t('profile.deleteLossTitle')}
                        tone='warning'
                    >
                        <ul className={styles.warningList}>
                            <li className={styles.warningItem}>
                                {t('profile.deleteLossAccess')}
                            </li>
                            <li className={styles.warningItem}>
                                {t('profile.deleteLossData')}
                            </li>
                            <li className={styles.warningItem}>
                                {t('profile.deleteLossRecovery')}
                            </li>
                        </ul>
                    </InlineAlert>
                    <Input
                        autoComplete='off'
                        disabled={pending}
                        label={t('profile.deleteConfirmLabel')}
                        hint={t('profile.deleteConfirmHint')}
                        onChange={(event) =>
                            setConfirmation(event.target.value)
                        }
                        spellCheck={false}
                        value={confirmation}
                    />
                    <Checkbox
                        checked={acknowledged}
                        disabled={pending}
                        label={t('profile.deleteAcknowledge')}
                        onChange={(event) =>
                            setAcknowledged(event.target.checked)
                        }
                    />
                    {error ? (
                        <InlineAlert
                            title={t('profile.deleteFailedTitle')}
                            tone='error'
                        >
                            {error}
                        </InlineAlert>
                    ) : null}
                </form>
            </Dialog>
        </>
    );
}
