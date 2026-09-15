'use client';

import type { AccountDeletionScheduleResponse } from '@languon/contracts';
import { useState, type FormEvent } from 'react';

import { AuthApiError, authApi } from '@/fsd/shared/api/auth-api';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, Field, Input } from '@/fsd/shared/ui';

import styles from './account-controls.module.css';

export function AccountDeletionAction({ onScheduled, requestWithSession }: {
    onScheduled(receipt: AccountDeletionScheduleResponse): void;
    requestWithSession<T>(operation: (accessToken: string) => Promise<T>): Promise<T>;
}) {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [confirmation, setConfirmation] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function close() { if (!pending) { setOpen(false); setConfirmation(''); setError(null); } }
    async function schedule(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (confirmation !== 'DELETE' || pending) return;
        setPending(true);
        setError(null);
        try {
            const receipt = await requestWithSession((token) => authApi.scheduleAccountDeletion(token));
            onScheduled(receipt);
            setOpen(false);
        } catch (caught) {
            if (caught instanceof AuthApiError) {
                if (caught.status === 401 || caught.status === 403) setError(t('profile.deleteRecentAuth'));
                else if (caught.detail.code === 'owner_transfer_required') setError(t('profile.deleteOwnerTransfer'));
                else if (caught.status === 409) setError(t('profile.deleteConflict'));
                else setError(t('profile.deleteFailed'));
            } else setError(t('profile.deleteFailed'));
        } finally { setPending(false); }
    }

    return <>
        <Button onClick={() => setOpen(true)} size='compact' variant='danger'>{t('profile.deleteAccount')}</Button>
        <Dialog closeLabel={t('profile.dismiss')} description={t('profile.deleteConfirmDescription')}
            dismissible={!pending} onClose={close} open={open} role='alertdialog'
            showCloseButton={!pending} title={t('profile.deleteConfirmTitle')}>
            <form className={styles.confirmForm} onSubmit={schedule}>
                <Field {...(error ? { error } : {})} label={t('profile.deleteConfirmLabel')} required>
                    <Input autoComplete='off' disabled={pending} onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
                </Field>
                <div className={styles.confirmActions}>
                    <Button disabled={pending} onClick={close} type='button' variant='secondary'>{t('profile.deleteKeep')}</Button>
                    <Button disabled={pending || confirmation !== 'DELETE'} type='submit' variant='danger'>
                        {t(pending ? 'profile.deletePending' : 'profile.deleteConfirmAction')}
                    </Button>
                </div>
            </form>
        </Dialog>
    </>;
}
