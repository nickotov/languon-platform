import { Globe, LogIn } from 'lucide-react';
import { Avatar, Button, Logo } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './public-page.module.css';

export function PublicHeader({
    signedIn,
    onSignIn,
    minimal = false,
}: {
    signedIn: boolean;
    minimal?: boolean;
    onSignIn(): void;
}) {
    const { href, t } = useI18n();

    return (
        <header className={styles.header}>
            <Logo href={href('/texts')} />
            {!minimal && (
                <span className={styles.sharedBadge}>
                    <Globe size={14} aria-hidden />
                    {t('texts.public.readOnly')}
                </span>
            )}
            {!minimal && (
                <div className={styles.account}>
                    {signedIn ? (
                        <span className={styles.signedIn}>
                            <Avatar size='sm' />
                            <span>{t('texts.public.signedIn')}</span>
                        </span>
                    ) : (
                        <Button
                            desktopIconOnly
                            size='compact'
                            variant='secondary'
                            onClick={onSignIn}
                            leadingIcon={<LogIn size={16} aria-hidden />}
                        >
                            {t('texts.public.signIn')}
                        </Button>
                    )}
                </div>
            )}
        </header>
    );
}
