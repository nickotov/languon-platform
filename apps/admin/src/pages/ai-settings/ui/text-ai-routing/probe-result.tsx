import type { TextAiProbe } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Descriptions, Tag } from 'antd';
import { probeEvidenceAge } from '../../lib/text-ai-routing-form';

export function ProbeResult({ probe }: { probe: TextAiProbe }) {
    const t = useTranslate();
    const age = probeEvidenceAge(probe.evidenceExpiresAt);
    const cost =
        probe.providerCostUsd === null
            ? t('routing.unknown')
            : `$${probe.providerCostUsd}`;
    const elapsed = probe.elapsedMs === null ? '—' : `${probe.elapsedMs} ms`;
    const firstOutput =
        probe.firstOutputMs === null ? '—' : `${probe.firstOutputMs} ms`;
    const tokens = `${probe.inputTokens ?? '—'} / ${probe.outputTokens ?? '—'} (${probe.measurement})`;
    const checked = new Date(probe.startedAt).toLocaleString();
    const items = [
        {
            key: 'state',
            label: t('routing.checkState'),
            children: <Tag>{probe.state}</Tag>,
        },
        {
            key: 'flow',
            label: t('routing.flow'),
            children: probe.flowId ?? t('routing.quick'),
        },
        { key: 'time', label: t('routing.checked'), children: checked },
        { key: 'elapsed', label: t('routing.elapsed'), children: elapsed },
        {
            key: 'first',
            label: t('routing.firstOutput'),
            children: firstOutput,
        },
        { key: 'tokens', label: t('routing.tokens'), children: tokens },
        { key: 'cost', label: t('routing.cost'), children: cost },
        {
            key: 'evidence',
            label: t('routing.evidence'),
            children: t(`routing.evidence.${age}`),
        },
        {
            key: 'failure',
            label: t('routing.failure'),
            children: probe.failure
                ? t(`routing.failure.${probe.failure}`)
                : '—',
        },
    ];

    if (probe.recoveredAt)
        items.push({
            key: 'recovered',
            label: t('routing.recovered'),
            children: new Date(probe.recoveredAt).toLocaleString(),
        });

    return <Descriptions size='small' column={1} items={items} />;
}
