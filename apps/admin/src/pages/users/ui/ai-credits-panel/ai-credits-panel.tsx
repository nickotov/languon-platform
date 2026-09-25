import type {
    AdminAiCreditAdjustmentRequest,
    AdminAiCreditPolicyMutationRequest,
} from '@languon/contracts';
import { useLogout, useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Descriptions, Space, Statistic, Tag } from 'antd';
import { useEffect, useState } from 'react';

import { aiCreditErrorCode, useAiCredits } from '../../hooks/use-ai-credits';
import { AiCreditAdjustmentDialog } from './ai-credit-adjustment-dialog';
import { AiCreditHistory } from './ai-credit-history';
import { AiCreditPolicyDialog } from './ai-credit-policy-dialog';

type Props = {
    mutable: boolean;
    userId: string;
};

export function AiCreditsPanel({ mutable, userId }: Props) {
    const translate = useTranslate();
    const logout = useLogout();
    const credits = useAiCredits(userId);
    const [dialog, setDialog] = useState<'adjustment' | 'policy' | null>(null);
    const account = credits.data?.account;
    const errorCode = aiCreditErrorCode(credits.error);

    useEffect(() => setDialog(null), [userId]);

    const closeDialog = () => {
        setDialog(null);
        credits.clearError();
    };
    const openPolicy = () => {
        credits.clearError();
        setDialog('policy');
    };
    const openAdjustment = () => {
        credits.clearError();
        setDialog('adjustment');
    };
    const handlePolicy = async (
        request: AdminAiCreditPolicyMutationRequest,
    ) => {
        try {
            await credits.updatePolicy(request);
            closeDialog();
        } catch {
            // The hook retains the normalized error for the open dialog.
        }
    };
    const handleAdjustment = async (
        request: AdminAiCreditAdjustmentRequest,
    ) => {
        try {
            await credits.adjustCredits(request);
            closeDialog();
        } catch {
            // The hook retains the normalized error for the open dialog.
        }
    };
    const handleReload = async () => {
        await credits.reload();
    };
    const handleConflictReload = async () => {
        await credits.reload();
        closeDialog();
    };
    const handleSignIn = () => logout.mutate();
    const handlePageChange = (nextPage: number) => credits.setPage(nextPage);

    if (!account && !credits.loading) {
        return (
            <Card title={translate('aiCredits.title')}>
                <Alert
                    action={
                        <Button onClick={handleReload}>
                            {translate('actions.retry')}
                        </Button>
                    }
                    message={
                        credits.error?.message ?? translate('aiCredits.error')
                    }
                    showIcon
                    type='error'
                />
            </Card>
        );
    }

    const modeLabel = account
        ? formatMode(account.effectiveMode, account.unlimitedUntil, translate)
        : translate('user.loading');
    const exhausted =
        account?.effectiveMode === 'limited' && account.availableCredits === 0;
    const mutationErrorAction =
        errorCode === 'recent_authentication_required' ? (
            <Button onClick={handleSignIn}>
                {translate('user.signInAgain')}
            </Button>
        ) : errorCode === 'ai_credit_account_conflict' ? (
            <Button onClick={handleConflictReload}>
                {translate('aiCredits.refreshConflict')}
            </Button>
        ) : undefined;

    return (
        <Card
            loading={credits.loading && !account}
            title={translate('aiCredits.title')}
        >
            {account ? (
                <Space
                    direction='vertical'
                    size='large'
                    style={{ width: '100%' }}
                >
                    {!account.enforcementEnabled ? (
                        <Alert
                            message={translate('aiCredits.enforcementInactive')}
                            showIcon
                            type='warning'
                        />
                    ) : null}
                    {exhausted ? (
                        <Alert
                            message={translate('aiCredits.exhausted')}
                            showIcon
                            type='error'
                        />
                    ) : null}
                    {!mutable ? (
                        <Alert
                            message={translate('aiCredits.targetUnavailable')}
                            showIcon
                            type='info'
                        />
                    ) : null}
                    {credits.error ? (
                        <Alert
                            action={mutationErrorAction}
                            message={credits.error.message}
                            showIcon
                            type='error'
                        />
                    ) : null}
                    <Descriptions
                        column={{ lg: 4, md: 2, sm: 1, xs: 1 }}
                        items={[
                            {
                                children: <Tag>{modeLabel}</Tag>,
                                key: 'mode',
                                label: translate('aiCredits.mode'),
                            },
                            {
                                children: formatDate(
                                    account.nextExpirationAt,
                                    translate,
                                ),
                                key: 'expiration',
                                label: translate('aiCredits.nextExpiry'),
                            },
                            {
                                children: account.managementVersion,
                                key: 'version',
                                label: translate('aiCredits.version'),
                            },
                        ]}
                    />
                    <Space size='large' wrap>
                        <Statistic
                            title={translate('aiCredits.available')}
                            value={account.availableCredits}
                        />
                        <Statistic
                            title={translate('aiCredits.reserved')}
                            value={account.reservedCredits}
                        />
                        <Statistic
                            title={translate('aiCredits.consumed')}
                            value={account.lifetimeConsumedCredits}
                        />
                    </Space>
                    <Space wrap>
                        <Button
                            disabled={
                                !mutable || credits.loading || credits.mutating
                            }
                            onClick={openPolicy}
                        >
                            {translate('aiCredits.changePolicy')}
                        </Button>
                        <Button
                            disabled={
                                !mutable || credits.loading || credits.mutating
                            }
                            onClick={openAdjustment}
                            type='primary'
                        >
                            {translate('aiCredits.adjust')}
                        </Button>
                    </Space>
                    <AiCreditHistory
                        entries={credits.data?.history ?? []}
                        onPageChange={handlePageChange}
                        page={credits.page}
                        pageSize={credits.pageSize}
                        total={credits.data?.total ?? 0}
                    />
                    <AiCreditPolicyDialog
                        account={account}
                        error={dialog === 'policy' ? credits.error : null}
                        errorAction={mutationErrorAction}
                        loading={credits.mutating}
                        onCancel={closeDialog}
                        onSubmit={handlePolicy}
                        open={dialog === 'policy'}
                    />
                    <AiCreditAdjustmentDialog
                        account={account}
                        error={dialog === 'adjustment' ? credits.error : null}
                        errorAction={mutationErrorAction}
                        loading={credits.mutating}
                        onCancel={closeDialog}
                        onSubmit={handleAdjustment}
                        open={dialog === 'adjustment'}
                    />
                </Space>
            ) : null}
        </Card>
    );
}

function formatDate(
    value: string | null,
    translate: ReturnType<typeof useTranslate>,
) {
    return value
        ? new Date(value).toLocaleString()
        : translate('aiCredits.none');
}

function formatMode(
    mode: 'limited' | 'unlimited',
    unlimitedUntil: string | null,
    translate: ReturnType<typeof useTranslate>,
) {
    if (mode === 'limited') return translate('aiCredits.limited');
    if (!unlimitedUntil) return translate('aiCredits.unlimitedPermanent');
    return translate('aiCredits.unlimitedUntilValue', {
        time: new Date(unlimitedUntil).toLocaleString(),
    });
}
