import { useI18n } from '@/fsd/shared/i18n';
import { Button, Card } from '@/fsd/shared/ui';
import styles from '../styles/auth-ui-common.module.css';
import profileStyles from '../styles/security-settings-common.module.css';

export function SecuritySessionsPanel({
    embedded,
    expiresAt,
    pending,
    onSignOutHere,
    onSignOutEverywhere,
}: {
    embedded: boolean;
    expiresAt: string | undefined;
    pending: boolean;
    onSignOutHere(): void;
    onSignOutEverywhere(): void;
}) {
    const { formatDate, t } = useI18n();

    return (
        <Card
            aria-labelledby='sessions-heading'
            className={embedded ? profileStyles.panel : styles.panel}
            padding={embedded ? 'none' : 'md'}
            variant={embedded ? 'outlined' : 'elevated'}
        >
            <h2
                className={embedded ? profileStyles.panelTitle : undefined}
                id='sessions-heading'
            >
                {t('security.sessions')}
            </h2>
            {embedded ? (
                <dl
                    className={`${styles.metadata ?? ''} ${profileStyles.panelSection}`}
                >
                    <div>
                        <dt>{t('security.sessionExpires')}</dt>
                        <dd>{expiresAt ? formatDate(expiresAt) : '—'}</dd>
                    </div>
                </dl>
            ) : null}
            <div
                className={
                    embedded
                        ? `${styles.actions} ${profileStyles.panelSection}`
                        : styles.actions
                }
            >
                <Button
                    disabled={pending}
                    onClick={onSignOutHere}
                    type='button'
                    variant='secondary'
                >
                    {t('security.signOutHere')}
                </Button>
                <Button
                    disabled={pending}
                    onClick={onSignOutEverywhere}
                    type='button'
                    variant='danger'
                >
                    {t('security.signOutEverywhere')}
                </Button>
            </div>
        </Card>
    );
}
