import type { AdminUserDetail } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Card, Descriptions, Typography } from 'antd';
import { StatusTag } from '../../users-page';

export function UserAccountSummary({
    detail,
    loading,
}: {
    detail: AdminUserDetail | undefined;
    loading: boolean;
}) {
    const translate = useTranslate();

    return (
        <Card loading={loading} title={translate('user.account')}>
            {detail ? (
                <Descriptions
                    column={1}
                    items={[
                        {
                            key: 'id',
                            label: translate('user.id'),
                            children: (
                                <Typography.Text copyable>
                                    {detail.id}
                                </Typography.Text>
                            ),
                        },
                        {
                            key: 'status',
                            label: translate('users.column.status'),
                            children: <StatusTag status={detail.status} />,
                        },
                        {
                            key: 'verified',
                            label: translate('user.email'),
                            children: detail.emailVerified
                                ? translate('users.verified')
                                : translate('users.unverified'),
                        },
                        {
                            key: 'access',
                            label: translate('user.administration'),
                            children: detail.isOwner
                                ? translate('access.owner')
                                : translate('user.noMembership'),
                        },
                        {
                            key: 'created',
                            label: translate('user.created'),
                            children: new Date(
                                detail.createdAt,
                            ).toLocaleString(),
                        },
                        {
                            key: 'updated',
                            label: translate('user.changed'),
                            children: new Date(
                                detail.updatedAt,
                            ).toLocaleString(),
                        },
                        {
                            key: 'version',
                            label: translate('user.version'),
                            children: detail.version,
                        },
                    ]}
                />
            ) : null}
        </Card>
    );
}
