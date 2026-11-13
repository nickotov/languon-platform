import { useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Card,
    Drawer,
    Empty,
    Input,
    Select,
    Skeleton,
    Table,
    Tabs,
    Tag,
    Typography,
    type TableColumnsType,
} from 'antd';
import type {
    AdminAiCatalogReference,
    AdminAiCatalogSummary,
} from '@languon/contracts';
import { LoadErrorAlert } from '@/shared/ui/load-error-alert';
import sharedStyles from '../../../shared/page.module.css';
import { useAiCatalog } from '../../hooks/use-ai-catalog';
import {
    catalogReferenceKey,
    filterCatalogEntries,
    readCatalogSelection,
    type CatalogKindFilter,
    type CatalogScopeFilter,
} from '../../lib/catalog-selection';
import { CatalogEntryName } from '../catalog-entry-name/catalog-entry-name';
import { CatalogEntryDetail } from '../catalog-entry-detail/catalog-entry-detail';
import styles from './ai-catalog-page.module.css';

export function AiCatalogPage() {
    const t = useTranslate();
    const [params, setParams] = useSearchParams();
    const selection = readCatalogSelection(params);
    const catalog = useAiCatalog(selection);
    const [search, setSearch] = useState('');
    const [kindFilter, setKindFilter] = useState<CatalogKindFilter>('all');
    const [scopeFilter, setScopeFilter] = useState<CatalogScopeFilter>('all');
    const visibleEntries = filterCatalogEntries(
        catalog.entries,
        search,
        kindFilter,
        scopeFilter,
    );
    const selectedSummary = catalog.entries.find(
        (candidate) =>
            candidate.kind === selection?.kind && candidate.id === selection.id,
    );
    const detailTitle =
        catalog.entry?.name ?? selectedSummary?.name ?? t('catalog.details');
    const detailOpen = selection !== null;
    const hasEntry = catalog.entry !== null;
    let emptyMessage = t('catalog.noMatches');
    if (catalog.listError) {
        emptyMessage = t('catalog.unavailable');
    } else if (catalog.entries.length === 0) {
        emptyMessage = t('catalog.empty');
    }

    const handleClearFilters = () => {
        setSearch('');
        setKindFilter('all');
        setScopeFilter('all');
    };
    const handleSearch = (event: ChangeEvent<HTMLInputElement>) =>
        setSearch(event.target.value);
    const handleKind = (kind: string) =>
        setKindFilter(kind as CatalogKindFilter);
    const handleSelect = (reference: AdminAiCatalogReference) => {
        const next = new URLSearchParams(params);
        next.set('kind', reference.kind);
        next.set('id', reference.id);
        setParams(next);
    };
    const handleClose = () => {
        const next = new URLSearchParams(params);
        next.delete('kind');
        next.delete('id');
        setParams(next);
    };
    const kindOptions = [
        { key: 'all', label: t('catalog.all') },
        ...(['agent', 'tool', 'prompt'] as const).map((kind) => ({
            key: kind,
            label: `${t(`catalog.${kind}s`)} (${catalog.entries.filter((entry) => entry.kind === kind).length})`,
        })),
    ];
    const scopeOptions = (
        ['all', 'application', 'development', 'template'] as const
    ).map((scope) => ({ value: scope, label: t(`catalog.scope.${scope}`) }));
    const columns: TableColumnsType<AdminAiCatalogSummary> = [
        {
            title: t('catalog.name'),
            key: 'name',
            render: (_, entry) => (
                <CatalogEntryName entry={entry} onSelect={handleSelect} />
            ),
        },
        {
            title: t('catalog.kind'),
            dataIndex: 'kind',
            width: 110,
            render: (kind: string) => t(`catalog.kind.${kind}`),
        },
        { title: t('catalog.module'), dataIndex: 'module', width: 150 },
        {
            title: t('catalog.scope'),
            dataIndex: 'scope',
            width: 150,
            render: (scope: string) => <Tag>{t(`catalog.scope.${scope}`)}</Tag>,
        },
    ];
    const detailContent = hasEntry ? (
        <CatalogEntryDetail
            entry={catalog.entry!}
            entries={catalog.entries}
            onSelect={handleSelect}
        />
    ) : null;

    return (
        <main className={sharedStyles.stack}>
            <header className={sharedStyles.heading}>
                <div>
                    <Typography.Text className={sharedStyles.eyebrow}>
                        {t('catalog.eyebrow')}
                    </Typography.Text>
                    <Typography.Title>{t('catalog.title')}</Typography.Title>
                    <Typography.Paragraph type='secondary'>
                        {t('catalog.description')}
                    </Typography.Paragraph>
                </div>
                <Tag>{t('catalog.readOnly')}</Tag>
            </header>
            <Alert type='info' showIcon message={t('catalog.readOnlyHelp')} />
            {catalog.listError ? (
                <LoadErrorAlert
                    error={catalog.listError}
                    message={t('catalog.listError')}
                    offlineDescription={t('errors.offline')}
                    onRetry={catalog.reloadList}
                    retryDescription={t('errors.retry')}
                    retryLabel={t('actions.retry')}
                />
            ) : null}
            <Card>
                <Tabs
                    activeKey={kindFilter}
                    items={kindOptions}
                    onChange={handleKind}
                />
                <div className={styles.filters}>
                    <div className={styles.search}>
                        <label htmlFor='ai-catalog-search'>
                            {t('catalog.search')}
                        </label>
                        <Input
                            id='ai-catalog-search'
                            allowClear
                            value={search}
                            placeholder={t('catalog.searchPlaceholder')}
                            onChange={handleSearch}
                        />
                    </div>
                    <div className={styles.scope}>
                        <label htmlFor='ai-catalog-scope'>
                            {t('catalog.scope')}
                        </label>
                        <Select<CatalogScopeFilter>
                            id='ai-catalog-scope'
                            value={scopeFilter}
                            options={scopeOptions}
                            onChange={setScopeFilter}
                        />
                    </div>
                </div>
                <Button onClick={handleClearFilters}>
                    {t('catalog.clearFilters')}
                </Button>
                <Typography.Paragraph type='secondary' aria-live='polite'>
                    {t('catalog.count', { count: visibleEntries.length })}
                </Typography.Paragraph>
                <Table<AdminAiCatalogSummary>
                    columns={columns}
                    dataSource={visibleEntries}
                    rowKey={catalogReferenceKey}
                    loading={catalog.listLoading}
                    locale={{ emptyText: <Empty description={emptyMessage} /> }}
                    scroll={{ x: 680 }}
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                />
            </Card>
            <Drawer
                title={detailTitle}
                open={detailOpen}
                onClose={handleClose}
                width='min(880px, 100vw)'
                destroyOnHidden
            >
                {catalog.detailError ? (
                    <LoadErrorAlert
                        error={catalog.detailError}
                        message={t('catalog.detailError')}
                        offlineDescription={t('errors.offline')}
                        onRetry={catalog.reloadDetail}
                        retryDescription={t('errors.retry')}
                        retryLabel={t('actions.retry')}
                    />
                ) : null}
                <Skeleton active loading={catalog.detailLoading}>
                    {detailContent}
                </Skeleton>
            </Drawer>
        </main>
    );
}
