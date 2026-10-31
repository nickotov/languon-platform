import { useTranslate } from '@refinedev/core';
import { Alert, Typography } from 'antd';

export function RoutingReadinessNotice() {
    const t = useTranslate();
    return (
        <Alert
            type='info'
            showIcon
            message={t('routing.readinessTitle')}
            description={
                <>
                    <Typography.Paragraph>
                        {t('routing.readinessHelp')}
                    </Typography.Paragraph>
                    <Typography.Text code>pnpm dev:doctor</Typography.Text>
                    <Typography.Paragraph>
                        {t('routing.readinessRecovery')}
                    </Typography.Paragraph>
                </>
            }
        />
    );
}
