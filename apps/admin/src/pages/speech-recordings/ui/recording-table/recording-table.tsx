import { Button, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useTranslate } from '@refinedev/core';
import type { AdminSpeechRecording } from '@languon/contracts';

export function RecordingTable({
    recordings,
    total,
    page,
    loading,
    selected,
    onSelect,
    onPage,
    onPreview,
}: {
    recordings: AdminSpeechRecording[];
    total: number;
    page: number;
    loading: boolean;
    selected: string[];
    onSelect(ids: string[]): void;
    onPage(page: number): void;
    onPreview(item: AdminSpeechRecording): void;
}) {
    const t = useTranslate();
    const handleSelection = (keys: React.Key[]) => onSelect(keys.map(String));
    const columns: TableColumnsType<AdminSpeechRecording> = [
        {
            title: t('speech.text'),
            dataIndex: 'text',
            width: 320,
            render: (text: string) => (
                <Typography.Paragraph
                    dir='auto'
                    ellipsis={{ rows: 2, expandable: true }}
                    style={{ marginBottom: 0 }}
                >
                    {text}
                </Typography.Paragraph>
            ),
        },
        { title: t('speech.language'), dataIndex: 'language', width: 100 },
        { title: t('speech.provider'), dataIndex: 'provider', width: 110 },
        { title: t('speech.model'), dataIndex: 'model', width: 200 },
        {
            title: t('speech.status'),
            dataIndex: 'state',
            width: 150,
            render: (state: string) => (
                <Tag>{t(`speech.status.${state}`, {}, state)}</Tag>
            ),
        },
        { title: t('speech.links'), dataIndex: 'bindingCount', width: 90 },
        {
            title: t('speech.duration'),
            dataIndex: 'durationMs',
            width: 100,
            render: (value: number | null) =>
                value === null ? '—' : `${(value / 1000).toFixed(1)} s`,
        },
        { title: t('speech.size'), dataIndex: 'byteLength', width: 100 },
        {
            title: t('speech.created'),
            dataIndex: 'createdAt',
            width: 180,
            render: (value: string) => new Date(value).toLocaleString(),
        },
        {
            title: t('speech.lastPlayed'),
            dataIndex: 'lastAccessedAt',
            width: 180,
            render: (value: string) => new Date(value).toLocaleString(),
        },
        {
            title: t('speech.preview'),
            key: 'preview',
            width: 110,
            render: (_, item) => (
                <PreviewButton item={item} onPreview={onPreview} />
            ),
        },
    ];
    return (
        <Table
            rowKey='id'
            columns={columns}
            dataSource={recordings}
            loading={loading}
            scroll={{ x: 1500 }}
            rowSelection={{
                selectedRowKeys: selected,
                onChange: handleSelection,
            }}
            pagination={{
                current: page,
                total,
                pageSize: 25,
                showSizeChanger: false,
                onChange: onPage,
            }}
        />
    );
}

function PreviewButton({
    item,
    onPreview,
}: {
    item: AdminSpeechRecording;
    onPreview(item: AdminSpeechRecording): void;
}) {
    const t = useTranslate();
    const handlePreview = () => onPreview(item);
    return <Button onClick={handlePreview}>{t('speech.preview')}</Button>;
}
