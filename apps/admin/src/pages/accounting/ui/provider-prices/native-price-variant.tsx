import type {
    ProviderNativeVariant,
    ProviderNativeRounding,
} from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Descriptions, List, Typography } from 'antd';

export function NativePriceVariant({
    variant,
    currency,
}: {
    variant: ProviderNativeVariant;
    currency: string;
}) {
    const t = useTranslate();
    const applies = variant.applies;
    const range = applies.inputTokens;
    const conditions = [
        ...(applies.endpointIds
            ? [
                  {
                      key: 'endpoints',
                      label: t('accounting.native.endpoints'),
                      children: applies.endpointIds.join(', '),
                  },
              ]
            : []),
        ...(applies.serviceTiers
            ? [
                  {
                      key: 'tiers',
                      label: t('accounting.native.tiers'),
                      children: applies.serviceTiers.join(', '),
                  },
              ]
            : []),
        ...(range
            ? [
                  {
                      key: 'context',
                      label: t('accounting.native.context'),
                      children: t(
                          range.maxExclusive === undefined
                              ? 'accounting.native.unboundedRange'
                              : 'accounting.native.range',
                          { min: range.minInclusive, max: range.maxExclusive },
                      ),
                  },
              ]
            : []),
        ...(applies.dispatchWindows
            ? [
                  {
                      key: 'windows',
                      label: t('accounting.native.windows'),
                      children: applies.dispatchWindows.map((window) => (
                          <div key={`${window.from}-${window.until}`}>
                              {t('accounting.native.window', {
                                  from: window.from,
                                  until: window.until,
                              })}
                          </div>
                      )),
                  },
              ]
            : []),
    ];
    const roundingText = (rounding: ProviderNativeRounding) =>
        t('accounting.native.rounding', {
            mode: t(`accounting.native.${rounding.mode}`),
            quantum: rounding.quantum,
            currency,
        });
    const renderComponent = (
        component: ProviderNativeVariant['components'][number],
    ) => (
        <List.Item>
            <div>
                <Typography.Text strong>
                    {t('accounting.native.rate', {
                        rate: component.pricePerUnit,
                        currency,
                        quantity: component.unitQuantity,
                        meter: t(`accounting.native.${component.meter}`),
                    })}
                </Typography.Text>
                <div>
                    {t(
                        component.chargeWhen === 'request'
                            ? 'accounting.native.chargeRequest'
                            : 'accounting.native.chargeUsage',
                    )}
                </div>
                {component.minimum !== undefined ? (
                    <div>
                        {t('accounting.native.minimum', {
                            minimum: component.minimum,
                            currency,
                        })}
                    </div>
                ) : null}
                {component.rounding ? (
                    <div>{roundingText(component.rounding)}</div>
                ) : null}
            </div>
        </List.Item>
    );
    return (
        <>
            {conditions.length ? (
                <Descriptions column={1} size='small' items={conditions} />
            ) : (
                <Typography.Paragraph>
                    {t('accounting.native.unrestricted')}
                </Typography.Paragraph>
            )}
            <List
                dataSource={variant.components}
                renderItem={renderComponent}
            />
            {variant.minimumPerRequest !== undefined ? (
                <Typography.Paragraph>
                    {t('accounting.native.requestMinimum', {
                        minimum: variant.minimumPerRequest,
                        currency,
                    })}
                </Typography.Paragraph>
            ) : null}
            {variant.totalRounding ? (
                <Typography.Paragraph>
                    {t('accounting.native.totalRounding')}:{' '}
                    {roundingText(variant.totalRounding)}
                </Typography.Paragraph>
            ) : null}
        </>
    );
}
