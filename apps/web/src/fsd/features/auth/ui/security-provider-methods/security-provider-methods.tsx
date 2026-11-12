import { AtSign, Globe2 } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, Card } from '@/fsd/shared/ui';
import profileStyles from '../styles/security-settings-common.module.css';

export function SecurityProviderMethods({
    email,
}: {
    email: string | undefined;
}) {
    const { t } = useI18n();

    return (
        <Card
            aria-labelledby='methods-heading'
            className={profileStyles.panel}
            padding='none'
            variant='outlined'
        >
            <div
                className={`${profileStyles.panelHeader} ${profileStyles.panelSection}`}
            >
                <h2 className={profileStyles.panelHeading} id='methods-heading'>
                    {t('profile.methodsTitle')}
                </h2>
                <p className={profileStyles.panelDescription}>
                    {t('profile.methodsDescription')}
                </p>
            </div>
            <div
                className={`${profileStyles.panelBody} ${profileStyles.panelSection}`}
            >
                <div className={profileStyles.rowList}>
                    <div className={profileStyles.dataRow}>
                        <span
                            aria-hidden='true'
                            className={profileStyles.rowIcon}
                        >
                            <AtSign size={18} />
                        </span>
                        <div className={profileStyles.rowCopy}>
                            <h3 className={profileStyles.rowTitle}>
                                {t('profile.emailMethod')}
                            </h3>
                            <p className={profileStyles.rowDescription}>
                                {email}
                            </p>
                        </div>
                        <Badge size='sm' tone='success'>
                            {t('profile.available')}
                        </Badge>
                    </div>
                    {(['Google', 'Yandex', 'Apple'] as const).map(
                        (provider) => (
                            <div
                                className={profileStyles.dataRow}
                                key={provider}
                            >
                                <span
                                    aria-hidden='true'
                                    className={profileStyles.rowIcon}
                                >
                                    <Globe2 size={18} />
                                </span>
                                <div className={profileStyles.rowCopy}>
                                    <h3 className={profileStyles.rowTitle}>
                                        {provider}{' '}
                                        <Badge size='sm' tone='neutral'>
                                            {t('profile.comingSoon')}
                                        </Badge>
                                    </h3>
                                    <p className={profileStyles.rowDescription}>
                                        {t('profile.providerComingSoon')}
                                    </p>
                                </div>
                                <Button
                                    className={profileStyles.rowButton}
                                    disabled
                                    size='compact'
                                    type='button'
                                    variant='secondary'
                                >
                                    {t('profile.connectProvider')}
                                </Button>
                            </div>
                        ),
                    )}
                </div>
            </div>
        </Card>
    );
}
