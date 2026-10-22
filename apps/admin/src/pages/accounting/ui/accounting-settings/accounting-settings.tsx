import type { AiAccountingSettingsSchema } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/shared/api/admin-api';
import {
    operatorBudgetOrderValid,
    type OperatorBudgetFields as OperatorBudgetValues,
} from '../../lib/operator-budgets';
import { OperatorBudgetFields } from './operator-budget-fields';

type Settings = (typeof AiAccountingSettingsSchema)['_output'];
export function AccountingSettings() {
    const t = useTranslate();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [form] = Form.useForm();
    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const value = await adminApi.accountingSettings(signal);
                if (!signal?.aborted) {
                    setSettings(value);
                    setError(null);
                    form.setFieldsValue({
                        defaultMaxCreditsPerAction:
                            value.defaultMaxCreditsPerAction ?? '',
                        maxProviderCostUsdPerAction:
                            value.maxProviderCostUsdPerAction ?? '',
                        maxProviderCostUsdPerAccountDay:
                            value.maxProviderCostUsdPerAccountDay ?? '',
                        maxProviderCostUsdPerDay:
                            value.maxProviderCostUsdPerDay ?? '',
                        reason: '',
                    });
                }
            } catch (caught) {
                if (!signal?.aborted)
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : 'Unable to load accounting settings.',
                    );
            }
        },
        [form],
    );
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);
    const reload = () => void load();
    const submit = async (
        values: OperatorBudgetValues & {
            defaultMaxCreditsPerAction: string;
            reason: string;
        },
    ) => {
        if (!settings) return;
        if (!operatorBudgetOrderValid(values)) {
            setError(t('accounting.operatorBudgetOrder'));
            return;
        }
        setError(null);
        setPending(true);
        try {
            await adminApi.publishAccountingSettings({
                expectedVersion: settings.version,
                defaultMaxCreditsPerAction:
                    values.defaultMaxCreditsPerAction.trim() || null,
                maxProviderCostUsdPerAction:
                    values.maxProviderCostUsdPerAction.trim() || null,
                maxProviderCostUsdPerAccountDay:
                    values.maxProviderCostUsdPerAccountDay.trim() || null,
                maxProviderCostUsdPerDay:
                    values.maxProviderCostUsdPerDay.trim() || null,
                reason: values.reason,
            });
            await load();
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : 'Unable to save settings.',
            );
        } finally {
            setPending(false);
        }
    };
    const unavailable = !settings || pending;
    return (
        <Card title={t('accounting.settings')}>
            <Typography.Paragraph>
                {t('accounting.budgetHelp')}
            </Typography.Paragraph>
            {error ? (
                <Alert
                    type='error'
                    message={error}
                    action={
                        <Button onClick={reload}>{t('actions.retry')}</Button>
                    }
                />
            ) : null}
            <Form
                name='accounting-settings'
                form={form}
                onFinish={submit}
                layout='vertical'
                disabled={unavailable}
            >
                <Form.Item
                    name='defaultMaxCreditsPerAction'
                    label={t('accounting.defaultBudget')}
                >
                    <Input inputMode='decimal' />
                </Form.Item>
                <Typography.Paragraph>
                    {t('accounting.operatorBudgetHelp')}
                </Typography.Paragraph>
                <OperatorBudgetFields />
                <Form.Item
                    name='reason'
                    label={t('aiSettings.reason')}
                    rules={[{ required: true, min: 5, max: 500 }]}
                >
                    <Input.TextArea />
                </Form.Item>
                <Button htmlType='submit' type='primary' loading={pending}>
                    {t('accounting.publishSettings')}
                </Button>
            </Form>
        </Card>
    );
}
