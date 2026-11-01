import { CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import type { AdminUserDetail } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Button, Card, Typography } from 'antd';
import styles from '../../../shared/page.module.css';

export function UserAvailability({
    detail,
    onOperation,
}: {
    detail: AdminUserDetail | undefined;
    onOperation(operation: 'disable' | 'restore' | 'deletion/cancel'): void;
}) {
    const translate = useTranslate();

    function handleCancelDeletion() {
        onOperation('deletion/cancel');
    }

    function handleAvailability() {
        onOperation(detail?.status === 'disabled' ? 'restore' : 'disable');
    }

    let action = null;
    if (detail?.status === 'deletion_pending') {
        action = (
            <Button
                icon={<CheckCircleOutlined />}
                onClick={handleCancelDeletion}
                type='primary'
            >
                {translate('user.cancelDeletion')}
            </Button>
        );
    } else if (detail?.status !== 'purged') {
        action = (
            <Button
                danger={detail?.status !== 'disabled'}
                disabled={!detail}
                icon={
                    detail?.status === 'disabled' ? (
                        <CheckCircleOutlined />
                    ) : (
                        <StopOutlined />
                    )
                }
                onClick={handleAvailability}
                type={detail?.status === 'disabled' ? 'primary' : 'default'}
            >
                {detail?.status === 'disabled'
                    ? translate('user.restore')
                    : translate('user.disable')}
            </Button>
        );
    }

    return (
        <Card className={styles.danger} title={translate('user.availability')}>
            <Typography.Paragraph type='secondary'>
                {translate(
                    detail?.status === 'deletion_pending'
                        ? 'user.deletionPendingDescription'
                        : 'user.availabilityDescription',
                )}
            </Typography.Paragraph>
            {action}
        </Card>
    );
}
