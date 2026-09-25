import type { AdminAiCreditHistoryEntry } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Pagination, Table, Typography, type TableProps } from 'antd';

type Props = {
    entries: AdminAiCreditHistoryEntry[];
    onPageChange: (page: number) => void;
    page: number;
    pageSize: number;
    total: number;
};

export function AiCreditHistory({
    entries,
    onPageChange,
    page,
    pageSize,
    total,
}: Props) {
    const translate = useTranslate();
    const columns = createColumns(translate);

    return (
        <div>
            <Typography.Title level={4}>
                {translate('aiCredits.history')}
            </Typography.Title>
            <Table<AdminAiCreditHistoryEntry>
                columns={columns}
                dataSource={entries}
                locale={{ emptyText: translate('aiCredits.emptyHistory') }}
                pagination={false}
                rowKey='id'
                scroll={{ x: 'max-content' }}
                size='small'
            />
            {total > pageSize ? (
                <Pagination
                    current={page}
                    onChange={onPageChange}
                    pageSize={pageSize}
                    showSizeChanger={false}
                    total={total}
                />
            ) : null}
        </div>
    );
}

function createColumns(
    translate: ReturnType<typeof useTranslate>,
): NonNullable<TableProps<AdminAiCreditHistoryEntry>['columns']> {
    return [
        {
            dataIndex: 'occurredAt',
            key: 'occurredAt',
            render: (value: string) => new Date(value).toLocaleString(),
            title: translate('aiCredits.historyTime'),
        },
        {
            dataIndex: 'kind',
            key: 'kind',
            render: (value: AdminAiCreditHistoryEntry['kind']) =>
                translate(`aiCredits.kind.${value}`),
            title: translate('aiCredits.historyKind'),
        },
        {
            dataIndex: 'amountCredits',
            key: 'amountCredits',
            render: (value: number) =>
                value === 0
                    ? '0'
                    : `${value < 0 ? '−' : '+'}${Math.abs(value).toLocaleString()}`,
            title: translate('aiCredits.amount'),
        },
        {
            dataIndex: 'expiresAt',
            key: 'expiresAt',
            render: (value: string | null) =>
                value
                    ? new Date(value).toLocaleString()
                    : translate('aiCredits.none'),
            title: translate('aiCredits.expiresAt'),
        },
        {
            key: 'source',
            render: (_value, entry) => {
                if (entry.sourceKind)
                    return translate(`aiCredits.source.${entry.sourceKind}`);
                if (entry.measurementSource)
                    return translate(
                        `aiCredits.measurement.${entry.measurementSource}`,
                    );
                return '—';
            },
            title: translate('aiCredits.historySource'),
        },
        {
            dataIndex: 'reason',
            key: 'reason',
            render: (value: string | null) => value ?? '—',
            title: translate('aiCredits.reason'),
        },
    ];
}
