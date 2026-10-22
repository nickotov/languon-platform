import { OperatorUsdBudgetSchema } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Form, Input } from 'antd';

export function OperatorBudgetFields() {
    const t = useTranslate();
    const validator = async (_rule: unknown, value: string | undefined) => {
        if (!value?.trim()) return;
        if (!OperatorUsdBudgetSchema.safeParse(value.trim()).success)
            throw new Error(t('accounting.operatorBudgetInvalid'));
    };
    const rules = [{ validator }];
    return (
        <>
            <Form.Item
                name='maxProviderCostUsdPerAction'
                label={t('accounting.operatorAction')}
                rules={rules}
            >
                <Input inputMode='decimal' />
            </Form.Item>
            <Form.Item
                name='maxProviderCostUsdPerAccountDay'
                label={t('accounting.operatorAccountDay')}
                rules={rules}
            >
                <Input inputMode='decimal' />
            </Form.Item>
            <Form.Item
                name='maxProviderCostUsdPerDay'
                label={t('accounting.operatorDay')}
                rules={rules}
            >
                <Input inputMode='decimal' />
            </Form.Item>
        </>
    );
}
