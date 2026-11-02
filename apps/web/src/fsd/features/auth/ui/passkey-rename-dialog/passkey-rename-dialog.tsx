import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    Field,
    InlineAlert,
    Input,
} from '@/fsd/shared/ui';

export function PasskeyRenameDialog({
    open,
    pending,
    draft,
    error,
    requiresRecentAuthentication,
    onCancel,
    onClose,
    onDraftChange,
    onSubmit,
}: {
    open: boolean;
    pending: boolean;
    draft: string;
    error: string | null;
    requiresRecentAuthentication: boolean;
    onCancel(): void;
    onClose(): void;
    onDraftChange(event: ChangeEvent<HTMLInputElement>): void;
    onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
    const { href, t } = useI18n();

    return (
        <Dialog
            closeLabel={t('profile.dismiss')}
            dismissible={!pending}
            footer={
                <DialogActions>
                    <Button
                        disabled={pending}
                        onClick={onCancel}
                        type='button'
                        variant='quiet'
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        disabled={pending || !open}
                        form='rename-passkey-form'
                        loading={pending}
                        type='submit'
                    >
                        {t('common.save')}
                    </Button>
                </DialogActions>
            }
            onClose={onClose}
            open={open}
            size='sm'
            title={t('security.renamePasskeyTitle')}
        >
            <form id='rename-passkey-form' onSubmit={onSubmit}>
                <Field label={t('security.newPasskeyName')} required>
                    <Input
                        autoComplete='off'
                        autoFocus
                        maxLength={160}
                        onChange={onDraftChange}
                        required
                        value={draft}
                    />
                </Field>
                {error ? <InlineAlert tone='error'>{error}</InlineAlert> : null}
                {requiresRecentAuthentication ? (
                    <p>
                        <Link
                            href={href(
                                '/login?returnTo=%2Fprofile%3Ftab%3Dsecurity',
                            )}
                        >
                            {t('security.signInAgain')}
                        </Link>
                    </p>
                ) : null}
            </form>
        </Dialog>
    );
}
