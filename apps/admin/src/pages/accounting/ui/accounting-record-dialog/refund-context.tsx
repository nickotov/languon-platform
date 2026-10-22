import type { AccountingRefundContextSchema } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Descriptions, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { adminApi } from '@/shared/api/admin-api';

type Context = (typeof AccountingRefundContextSchema)['_output'];
export function RefundContext({
    paymentId,
    onReady,
    onCreditLotAvailable,
}: {
    paymentId: string | undefined;
    onReady(ready: boolean): void;
    onCreditLotAvailable(available: boolean): void;
}) {
    const t = useTranslate();
    const [context, setContext] = useState<Context | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        onReady(false);
        onCreditLotAvailable(false);
        setContext(null);
        setError(null);
        if (paymentId)
            void adminApi
                .accountingRefundContext(paymentId, controller.signal)
                .then((value) => {
                    if (!controller.signal.aborted) {
                        setContext(value);
                        onReady(true);
                        onCreditLotAvailable(value.grantId !== null);
                    }
                })
                .catch((caught: unknown) => {
                    if (!controller.signal.aborted)
                        setError(
                            caught instanceof Error
                                ? caught.message
                                : 'Unable to load refund context.',
                        );
                });
        return () => controller.abort();
    }, [paymentId, onReady, onCreditLotAvailable, attempt]);
    const retry = () => setAttempt((value) => value + 1);
    if (!paymentId) return null;
    if (error)
        return (
            <Alert
                type='error'
                message={error}
                action={<Button onClick={retry}>{t('actions.retry')}</Button>}
            />
        );
    if (!context) return <Spin />;
    const items = [
        {
            key: 'paid',
            label: t('accounting.payments'),
            children: context.paidUsd,
        },
        {
            key: 'refunded',
            label: t('accounting.refunds'),
            children: context.refundedUsd,
        },
        {
            key: 'available',
            label: t('accounting.available'),
            children:
                context.availableCredits ?? t('accounting.removedCreditLot'),
        },
        {
            key: 'reserved',
            label: t('accounting.reserved'),
            children:
                context.reservedCredits ?? t('accounting.removedCreditLot'),
        },
        {
            key: 'consumed',
            label: t('accounting.consumed'),
            children:
                context.consumedCredits ?? t('accounting.removedCreditLot'),
        },
        {
            key: 'revoked',
            label: t('accounting.revoked'),
            children:
                context.revokedCredits ?? t('accounting.removedCreditLot'),
        },
    ];
    return <Descriptions column={1} bordered items={items} />;
}
