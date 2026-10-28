import type { ProviderPrice } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Collapse, Descriptions, Modal, Space } from 'antd';
import { NativePriceVariant } from './native-price-variant';
import styles from './native-pricing.module.css';

export function NativeProviderPriceDialog({
    price,
    onClose,
}: {
    price: ProviderPrice;
    onClose(): void;
}) {
    const t = useTranslate();
    const rules = price.nativeRules;
    if (!rules) return null;
    const currency = rules.currency?.code ?? 'USD';
    const items = [
        {
            key: 'provider',
            label: t('speech.provider'),
            children: price.providerId,
        },
        { key: 'model', label: t('speech.model'), children: price.modelId },
        {
            key: 'currency',
            label: t('accounting.native.currency'),
            children: currency,
        },
        ...(rules.currency
            ? [
                  {
                      key: 'conversion',
                      label: t('accounting.native.currencyConversion'),
                      children: t('accounting.native.conversion', {
                          numerator: rules.currency.usdNumerator,
                          denominator: rules.currency.unitDenominator,
                          currency,
                      }),
                  },
              ]
            : []),
        {
            key: 'from',
            label: t('accounting.native.validFrom'),
            children: rules.validFrom,
        },
        {
            key: 'until',
            label: t('accounting.native.validUntil'),
            children: rules.validUntil ?? t('accounting.native.noExpiry'),
        },
        {
            key: 'source',
            label: t('accounting.sourceReference'),
            children: price.sourceReference,
        },
        ...(price.sourceUrl
            ? [
                  {
                      key: 'url',
                      label: t('accounting.sourceUrl'),
                      children: price.sourceUrl,
                  },
              ]
            : []),
        ...(rules.reportedCreditUsdPerCredit
            ? [
                  {
                      key: 'credits',
                      label: t('accounting.native.credits'),
                      children: t('accounting.native.creditRate', {
                          rate: rules.reportedCreditUsdPerCredit,
                      }),
                  },
              ]
            : []),
    ];
    const variants = rules.variants.map((variant) => ({
        key: variant.id,
        label: variant.id,
        children: <NativePriceVariant variant={variant} currency={currency} />,
    }));
    return (
        <Modal
            open
            title={t('accounting.native.title')}
            onCancel={onClose}
            width={880}
            footer={
                <Button onClick={onClose}>
                    {t('accounting.native.close')}
                </Button>
            }
        >
            <Space
                direction='vertical'
                size='middle'
                className={styles.details ?? ''}
            >
                <Alert type='info' message={t('accounting.native.readOnly')} />
                <Descriptions column={1} size='small' items={items} />
                <Collapse
                    items={variants}
                    defaultActiveKey={
                        rules.variants[0] ? [rules.variants[0].id] : []
                    }
                />
            </Space>
        </Modal>
    );
}
