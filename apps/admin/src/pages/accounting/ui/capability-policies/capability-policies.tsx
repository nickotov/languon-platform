import type { CapabilityPolicy } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Card,
    Form,
    Input,
    Modal,
    Select,
    Table,
    Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/shared/api/admin-api';

export function CapabilityPolicies() {
    const t = useTranslate();
    const [policies, setPolicies] = useState<CapabilityPolicy[]>([]);
    const [editing, setEditing] = useState<CapabilityPolicy | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [form] = Form.useForm();
    const load = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const response = await adminApi.capabilityPolicies(signal);
            if (!signal?.aborted) {
                setPolicies(response.policies);
                setError(null);
            }
        } catch (caught) {
            if (!signal?.aborted)
                setError(
                    caught instanceof Error
                        ? caught.message
                        : 'Unable to load policies.',
                );
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load]);
    const reload = () => {
        setEditing(null);
        void load();
    };
    const close = () => setEditing(null);
    const edit = (policy: CapabilityPolicy) => {
        form.setFieldsValue({ funding: policy.funding, reason: '' });
        setEditing(policy);
        setError(null);
    };
    const submit = async (values: {
        funding: CapabilityPolicy['funding'];
        reason: string;
    }) => {
        if (!editing) return;
        setPending(true);
        try {
            await adminApi.publishCapabilityPolicy({
                capability: editing.capability,
                expectedVersion: editing.version,
                ...values,
            });
            setEditing(null);
            await load();
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : 'Unable to publish policy.',
            );
        } finally {
            setPending(false);
        }
    };
    const columns = [
        { title: t('accounting.capability'), dataIndex: 'capability' },
        {
            title: t('accounting.funding'),
            render: (_: unknown, policy: CapabilityPolicy) =>
                t(`accounting.funding.${policy.funding}`),
        },
        { title: t('pricing.revision'), dataIndex: 'version' },
        { title: t('pricing.updated'), dataIndex: 'updatedAt' },
        {
            title: t('actions.edit'),
            render: (_: unknown, policy: CapabilityPolicy) => (
                <EditPolicy policy={policy} onEdit={edit} />
            ),
        },
    ];
    const options = [
        { value: 'operator', label: t('accounting.funding.operator') },
        { value: 'customer', label: t('accounting.funding.customer') },
    ];
    return (
        <Card title={t('accounting.policies')}>
            <Typography.Paragraph>
                {t('accounting.policyHelp')}
            </Typography.Paragraph>
            {error ? (
                <Alert
                    type='error'
                    message={error}
                    action={
                        <Button onClick={reload}>
                            {t('accounting.reloadPolicies')}
                        </Button>
                    }
                />
            ) : null}
            <Table
                rowKey='capability'
                dataSource={policies}
                columns={columns}
                loading={loading}
                pagination={false}
                scroll={{ x: 800 }}
            />
            <Modal
                open={editing !== null}
                title={t('accounting.publishPolicy')}
                onCancel={close}
                footer={null}
                closable={!pending}
                maskClosable={!pending}
                keyboard={!pending}
            >
                <Typography.Paragraph>
                    {t('accounting.policyFutureOnly')}
                </Typography.Paragraph>
                <Form
                    form={form}
                    layout='vertical'
                    onFinish={submit}
                    disabled={pending}
                >
                    <Form.Item
                        name='funding'
                        label={t('accounting.funding')}
                        rules={[{ required: true }]}
                    >
                        <Select options={options} />
                    </Form.Item>
                    <Form.Item
                        name='reason'
                        label={t('aiSettings.reason')}
                        rules={[{ required: true, min: 5, max: 500 }]}
                    >
                        <Input.TextArea />
                    </Form.Item>
                    <Button htmlType='submit' loading={pending} type='primary'>
                        {t('accounting.publishPolicy')}
                    </Button>
                </Form>
            </Modal>
        </Card>
    );
}
function EditPolicy({
    policy,
    onEdit,
}: {
    policy: CapabilityPolicy;
    onEdit(policy: CapabilityPolicy): void;
}) {
    const t = useTranslate();
    const handleEdit = () => onEdit(policy);
    return <Button onClick={handleEdit}>{t('actions.edit')}</Button>;
}
