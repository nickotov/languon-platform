import Link from 'next/link';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, DialogActions, InlineAlert } from '@/fsd/shared/ui';

export function PasskeyRevokeDialog({
    open,
    pending,
    passkeyName,
    error,
    requiresRecentAuthentication,
    onCancel,
    onClose,
    onConfirm,
}: {
    open: boolean;
    pending: boolean;
    passkeyName: string | undefined;
    error: string | null;
    requiresRecentAuthentication: boolean;
    onCancel(): void;
    onClose(): void;
    onConfirm(): void;
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
                        {t('security.keepPasskey')}
                    </Button>
                    <Button
                        disabled={pending || !open}
                        onClick={onConfirm}
                        type='button'
                        variant='danger'
                    >
                        {t(
                            pending
                                ? 'security.revokingPasskey'
                                : 'security.revokePasskey',
                        )}
                    </Button>
                </DialogActions>
            }
            onClose={onClose}
            open={open}
            role='alertdialog'
            showCloseButton={!pending}
            size='sm'
            title={t('security.revokePasskeyTitle')}
        >
            <p>
                {t('security.revokePasskeyDescription', {
                    name: passkeyName ?? t('security.passkeys'),
                })}
            </p>
            <p>{t('security.revokePasskeyFallback')}</p>
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
        </Dialog>
    );
}
