import type { ProviderPrice } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Table, Typography } from 'antd';
import { useProviderPrices } from '../../hooks/use-provider-prices';
import { ProviderPriceDialog } from './provider-price-dialog';

export function ProviderPrices() {
    const t = useTranslate();
    const pricing = useProviderPrices();
    const columns = [
        { title: t('speech.provider'), dataIndex: 'providerId' },
        { title: t('speech.model'), dataIndex: 'modelId' },
        { title: t('pricing.meter'), dataIndex: 'meter' },
        {
            title: t('accounting.usdRates'),
            render: (_: unknown, price: ProviderPrice) => (
                <ProviderRates price={price} />
            ),
        },
        { title: t('pricing.revision'), dataIndex: 'version' },
        { title: t('accounting.effectiveAt'), dataIndex: 'effectiveAt' },
        {
            title: t('accounting.sourceReference'),
            dataIndex: 'sourceReference',
        },
        {
            title: t('accounting.native.actions'),
            render: (_: unknown, price: ProviderPrice) => (
                <EditProviderPrice price={price} onEdit={pricing.open} />
            ),
        },
    ];
    const dialogPrice = pricing.editing === 'new' ? null : pricing.editing;
    return (
        <Card
            title={t('accounting.providerPrices')}
            extra={
                <Button onClick={pricing.add}>
                    {t('accounting.addProviderPrice')}
                </Button>
            }
        >
            <Typography.Paragraph>
                {t('accounting.providerPricesHelp')}
            </Typography.Paragraph>
            {pricing.error ? (
                <Alert
                    type='error'
                    message={pricing.error}
                    action={
                        <Button onClick={pricing.reload}>
                            {t('actions.retry')}
                        </Button>
                    }
                />
            ) : null}
            <Table
                rowKey='id'
                dataSource={pricing.prices}
                loading={pricing.loading}
                columns={columns}
                scroll={{ x: 1300 }}
                pagination={false}
            />
            {pricing.editing !== null ? (
                <ProviderPriceDialog
                    price={dialogPrice}
                    pending={pricing.pending}
                    error={pricing.saveError}
                    onSubmit={pricing.publish}
                    onClose={pricing.close}
                    onReload={pricing.reload}
                />
            ) : null}
        </Card>
    );
}
function EditProviderPrice({
    price,
    onEdit,
}: {
    price: ProviderPrice;
    onEdit(price: ProviderPrice): void;
}) {
    const t = useTranslate();
    const edit = () => onEdit(price);
    return (
        <Button onClick={edit}>
            {t(price.nativeRules ? 'accounting.native.view' : 'actions.edit')}
        </Button>
    );
}
function ProviderRates({ price }: { price: ProviderPrice }) {
    const t = useTranslate();
    if (price.nativeRules) {
        return (
            <>
                <Typography.Text strong>
                    {t('accounting.native.title')}
                </Typography.Text>
                <Typography.Paragraph>
                    {t('accounting.native.summary', {
                        currency: price.nativeRules.currency?.code ?? 'USD',
                        count: price.nativeRules.variants.length,
                    })}
                </Typography.Paragraph>
            </>
        );
    }
    if (price.meter === 'speech-characters')
        return (
            <Typography.Text>
                {t('accounting.usdCharacterRate', {
                    rate: price.usdPer1000Characters ?? t('accounting.unknown'),
                })}
            </Typography.Text>
        );
    const label = t('accounting.usdTokenRates', {
        input: price.inputUsdPerMillionTokens ?? t('accounting.unknown'),
        output: price.outputUsdPerMillionTokens ?? t('accounting.unknown'),
    });
    const cache = t('accounting.usdCacheRates', {
        read: price.cacheReadUsdPerMillionTokens ?? t('accounting.unknown'),
        write: price.cacheWriteUsdPerMillionTokens ?? t('accounting.unknown'),
    });
    return (
        <>
            <Typography.Paragraph>{label}</Typography.Paragraph>
            <Typography.Paragraph type='secondary'>
                {t('accounting.usdMinimumRequestValue', {
                    minimum:
                        price.minimumUsdPerRequest ?? t('accounting.unknown'),
                })}
            </Typography.Paragraph>
            <Typography.Text type='secondary'>{cache}</Typography.Text>
        </>
    );
}
