import { Mail } from 'lucide-react';
import { Button, ButtonLink, Dialog } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './public-page.module.css';

export function PublicSignInDialog({
    open,
    onClose,
    returnTo,
    shareKey,
}: {
    open: boolean;
    onClose(): void;
    returnTo: string;
    shareKey: string;
}) {
    const { href, t } = useI18n();
    const query = new URLSearchParams({ returnTo }).toString();
    const login = href(`/login?${query}#${shareKey}`);
    const signup = href(`/signup?${query}#${shareKey}`);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            size='sm'
            title={t('texts.public.signInTitle')}
            description={t('texts.public.signInHelp')}
            closeLabel={t('texts.public.close')}
        >
            <div className={styles.stack}>
                <ButtonLink
                    desktopIconOnly
                    leadingIcon={<Mail size={16} aria-hidden />}
                    href={login}
                >
                    {t('texts.public.email')}
                </ButtonLink>
                <Button variant='ghost' fullWidth onClick={onClose}>
                    {t('texts.public.keepReading')}
                </Button>
                <ButtonLink href={signup} variant='quiet'>
                    {t('texts.public.newAccount')}
                </ButtonLink>
            </div>
        </Dialog>
    );
}
