import { useState } from 'react';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Checkbox, Form, Select, Typography } from 'antd';
import type {
    TextAiProbe,
    TextAiProbeRequest,
    TextAiProbeRecoveryRequest,
} from '@languon/contracts';
import type { adminApi } from '@/shared/api/admin-api';
import type { RoutingCatalog } from '../../lib/text-ai-routing-form';
import {
    reviewedRouteOptions,
    textAiFlows,
    latestRouteProbe,
} from '../../lib/text-ai-routing-form';
import { ProbeRecovery } from './probe-recovery';
import { ProbeResult } from './probe-result';

type Limits = Awaited<ReturnType<typeof adminApi.textAiProbes>>['limits'];

export function ProbeControls({
    catalog,
    probes,
    limits,
    pending,
    onRun,
    onRecover,
}: {
    catalog: RoutingCatalog;
    probes: TextAiProbe[];
    limits: Limits;
    pending: boolean;
    onRun(request: TextAiProbeRequest): Promise<void>;
    onRecover(
        probeId: string,
        request: TextAiProbeRecoveryRequest,
    ): Promise<void>;
}) {
    const t = useTranslate();
    const [form] = Form.useForm<TextAiProbeRequest>();
    const [approvedSelection, setApprovedSelection] = useState<string | null>(
        null,
    );
    const routeId = Form.useWatch('routeId', form);
    const kind = Form.useWatch('kind', form) ?? 'quick';
    const flowId = Form.useWatch('flowId', form);
    const approvalSelection = JSON.stringify([
        routeId ?? null,
        kind,
        kind === 'flow' ? (flowId ?? null) : null,
        limits.maximumCostUsd,
    ]);
    const approved = approvedSelection === approvalSelection;
    const options = reviewedRouteOptions(catalog, false);
    const flowOptions = textAiFlows.map((value) => ({ value, label: value }));
    const kindOptions = [
        { value: 'quick', label: t('routing.quick') },
        { value: 'flow', label: t('routing.testFlow') },
    ];
    const result = latestRouteProbe(probes, routeId, { kind, flowId });
    const isFlow = kind === 'flow';
    const canRecover =
        result !== undefined &&
        !result.recoveredAt &&
        (result.state === 'running' ||
            result.failure === 'execution_unknown' ||
            result.failure === 'timeout');
    const notice = t('routing.probeBudget', {
        maximum: limits.maximumCostUsd,
        daily: limits.dailyMaximumCostUsd,
        cooldown: limits.cooldownSeconds,
    });

    const handleApprovalChange = () =>
        setApprovedSelection(approved ? null : approvalSelection);
    const handleValuesChange = () => setApprovedSelection(null);
    const handleFinish = async (values: TextAiProbeRequest) => {
        if (!approved) return;
        const request: TextAiProbeRequest = {
            routeId: values.routeId,
            kind: values.kind,
            approvedMaximumCostUsd: limits.maximumCostUsd,
        };
        if (values.kind === 'flow') request.flowId = values.flowId;
        await onRun(request);
        setApprovedSelection(null);
    };

    return (
        <Card title={t('routing.checks')}>
            <Typography.Paragraph>
                {t('routing.checkHelp')}
            </Typography.Paragraph>
            <Alert
                showIcon
                type='info'
                message={notice}
                description={t('routing.operatorExpense')}
            />
            <Form
                name='text-ai-probe'
                form={form}
                layout='vertical'
                initialValues={{ kind: 'quick' }}
                onFinish={handleFinish}
                onValuesChange={handleValuesChange}
            >
                <Form.Item
                    name='routeId'
                    label={t('routing.route')}
                    rules={[{ required: true }]}
                >
                    <Select
                        virtual={false}
                        options={options}
                        optionFilterProp='label'
                        showSearch
                    />
                </Form.Item>
                <Form.Item name='kind' label={t('routing.checkType')}>
                    <Select virtual={false} options={kindOptions} />
                </Form.Item>
                {isFlow ? (
                    <Form.Item
                        name='flowId'
                        label={t('routing.flow')}
                        rules={[{ required: true }]}
                    >
                        <Select
                            virtual={false}
                            options={flowOptions}
                            showSearch
                            optionFilterProp='label'
                        />
                    </Form.Item>
                ) : null}
                <Form.Item>
                    <Checkbox
                        checked={approved}
                        onChange={handleApprovalChange}
                    >
                        {t('routing.approveCost')}
                    </Checkbox>
                </Form.Item>
                <Button
                    aria-label={t('routing.runCheck')}
                    aria-busy={pending}
                    htmlType='submit'
                    type='primary'
                    disabled={!approved}
                    loading={pending}
                >
                    {t('routing.runCheck')}
                </Button>
            </Form>
            {result ? (
                <ProbeResult probe={result} />
            ) : routeId && (!isFlow || flowId) ? (
                <Alert
                    type='warning'
                    showIcon
                    message={t('routing.noSelectedCheck')}
                />
            ) : null}
            {result && canRecover ? (
                <ProbeRecovery
                    probe={result}
                    pending={pending}
                    onRecover={onRecover}
                />
            ) : null}
        </Card>
    );
}
