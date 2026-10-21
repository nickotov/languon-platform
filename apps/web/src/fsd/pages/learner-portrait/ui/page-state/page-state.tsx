import type { ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { portraitCopy } from '../../lib/copy';
import type { PortraitManagement } from '../../hooks/use-portrait-management';
import styles from '../common.module.css';

export function PortraitPageState({
    management,
    children,
}: {
    management: PortraitManagement;
    children: ReactNode;
}) {
    const { locale } = useI18n();
    function retry() {
        void management.query.refetch();
        void management.status.refetch();
    }
    if (!management.ownerId)
        return (
            <div className={styles.page}>
                <ButtonLink href='/login'>
                    {portraitCopy(locale, 'signIn')}
                </ButtonLink>
            </div>
        );
    if (management.query.isPending || management.status.isPending)
        return (
            <div className={styles.page} aria-busy>
                <LoadingState>{portraitCopy(locale, 'loading')}</LoadingState>
            </div>
        );
    if (management.query.isError || management.status.isError)
        return (
            <div className={styles.page}>
                <h1 className={styles.title}>
                    {portraitCopy(locale, 'title')}
                </h1>
                <InlineAlert
                    tone='error'
                    title={portraitCopy(locale, 'loadError')}
                    actions={
                        <Button onClick={retry}>
                            {portraitCopy(locale, 'retry')}
                        </Button>
                    }
                >
                    {portraitCopy(locale, 'unchanged')}
                </InlineAlert>
            </div>
        );
    return children;
}
