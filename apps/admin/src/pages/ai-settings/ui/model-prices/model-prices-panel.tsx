import { Alert, Button, Card, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useLogout, useTranslate } from '@refinedev/core';
import type { ModelPrice } from '@languon/contracts';
import { useModelPrices } from '../../hooks/use-model-prices';
import { ModelPriceDialog } from './model-price-dialog';

export function ModelPricesPanel() {
    const t = useTranslate();
    const logout = useLogout();
    const pricing = useModelPrices();
    const signIn = () => logout.mutate();
    const columns: TableColumnsType<ModelPrice> = [
        { title: t('speech.provider'), dataIndex: 'providerId' },
        { title: t('speech.model'), dataIndex: 'modelId' },
        { title: t('pricing.meter'), dataIndex: 'meter' },
        {
            title: t('pricing.rates'),
            render: (_, price) => <PriceRates price={price} />,
        },
        { title: t('pricing.revision'), dataIndex: 'version' },
        {
            title: t('pricing.updated'),
            dataIndex: 'updatedAt',
            render: (value: string | null) =>
                value ? new Date(value).toLocaleString() : '—',
        },
        {
            title: t('pricing.edit'),
            render: (_, price) => (
                <EditPriceButton price={price} onEdit={pricing.edit} />
            ),
        },
    ];
    const rowKey = (price: ModelPrice) =>
        `${price.providerId}:${price.modelId}:${price.meter}`;
    return (
        <Card title={t('pricing.title')}>
            <Typography.Paragraph>
                {t('pricing.description')}
            </Typography.Paragraph>
            {pricing.error ? (
                <Alert
                    type='error'
                    message={pricing.error.message}
                    action={
                        <Button onClick={pricing.refresh}>
                            {t('actions.retry')}
                        </Button>
                    }
                />
            ) : null}
            <Table
                columns={columns}
                rowKey={rowKey}
                dataSource={pricing.prices}
                loading={pricing.loading}
                scroll={{ x: 1100 }}
                pagination={false}
            />
            {pricing.editing ? (
                <ModelPriceDialog
                    key={rowKey(pricing.editing)}
                    price={pricing.editing}
                    pending={pricing.pending}
                    blocked={pricing.blocked}
                    error={pricing.saveError}
                    onSubmit={pricing.publish}
                    onClose={pricing.close}
                    onReload={pricing.refresh}
                    onSignIn={signIn}
                />
            ) : null}
        </Card>
    );
}
function PriceRates({ price }: { price: ModelPrice }) {
    const t = useTranslate();
    let label = t('pricing.tokenRates', {
        input: price.inputCreditsPerMillionTokens,
        output: price.outputCreditsPerMillionTokens,
    });
    if (price.meter === 'speech-characters')
        label = t('pricing.characterRates', {
            rate: price.creditsPer1000Characters,
            minimum: price.minimumCredits,
        });
    const cachedLabel =
        price.cachedInputCreditsPerMillionTokens == null
            ? t('pricing.cachedInputFallback')
            : t('pricing.cachedInputValue', {
                  rate: price.cachedInputCreditsPerMillionTokens,
              });
    const showCachedRate = price.meter === 'text-tokens';
    return (
        <Space wrap>
            <Typography.Text>{label}</Typography.Text>
            {showCachedRate ? (
                <Typography.Text type='secondary'>
                    {cachedLabel}
                </Typography.Text>
            ) : null}
            {price.provisional ? <Tag>{t('pricing.provisional')}</Tag> : null}
        </Space>
    );
}
function EditPriceButton({
    price,
    onEdit,
}: {
    price: ModelPrice;
    onEdit(price: ModelPrice): void;
}) {
    const t = useTranslate();
    const handleEdit = () => onEdit(price);
    if (price.meter === 'text-tokens')
        return <Tag>{t('pricing.historicalText')}</Tag>;
    return <Button onClick={handleEdit}>{t('pricing.edit')}</Button>;
}
