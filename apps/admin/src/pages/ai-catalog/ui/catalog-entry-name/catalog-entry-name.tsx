import type {
    AdminAiCatalogReference,
    AdminAiCatalogSummary,
} from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Button, Space, Typography } from 'antd';
import styles from './catalog-entry-name.module.css';

export function CatalogEntryName({
    entry,
    onSelect,
}: {
    entry: AdminAiCatalogSummary;
    onSelect(reference: AdminAiCatalogReference): void;
}) {
    const t = useTranslate();
    const handleSelect = () => onSelect({ kind: entry.kind, id: entry.id });
    const label = t('catalog.open', { name: entry.name });

    return (
        <Space direction='vertical' size={0} className={styles.entryName ?? ''}>
            <Button
                type='link'
                className={styles.nameButton ?? ''}
                onClick={handleSelect}
                aria-label={label}
            >
                {entry.name}
            </Button>
            <Typography.Text code className={styles.identifier ?? ''}>
                {entry.id}
            </Typography.Text>
            <Typography.Paragraph
                ellipsis={{ rows: 2 }}
                className={styles.description ?? ''}
            >
                {entry.description}
            </Typography.Paragraph>
        </Space>
    );
}
