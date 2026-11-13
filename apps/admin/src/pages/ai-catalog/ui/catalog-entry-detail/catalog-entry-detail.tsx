import type {
    AdminAiCatalogEntry,
    AdminAiCatalogReference,
    AdminAiCatalogSummary,
} from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Descriptions,
    Empty,
    Space,
    Tag,
    Typography,
} from 'antd';
import { catalogReferenceKey } from '../../lib/catalog-selection';
import styles from './catalog-entry-detail.module.css';

export function CatalogEntryDetail({
    entry,
    entries,
    onSelect,
}: {
    entry: AdminAiCatalogEntry;
    entries: readonly AdminAiCatalogSummary[];
    onSelect(reference: AdminAiCatalogReference): void;
}) {
    const t = useTranslate();
    const hasRelationships = entry.references.length > 0;
    const hasLimitations = entry.limitations.length > 0;

    return (
        <div className={styles.stack}>
            <Typography.Paragraph>{entry.description}</Typography.Paragraph>
            <Descriptions column={1} size='small'>
                <Descriptions.Item label={t('catalog.identifier')}>
                    <Typography.Text code>{entry.id}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('catalog.kind')}>
                    {t(`catalog.kind.${entry.kind}`)}
                </Descriptions.Item>
                <Descriptions.Item label={t('catalog.module')}>
                    {entry.module}
                </Descriptions.Item>
                <Descriptions.Item label={t('catalog.scope')}>
                    <Tag>{t(`catalog.scope.${entry.scope}`)}</Tag>
                </Descriptions.Item>
            </Descriptions>
            {hasLimitations ? (
                <Alert
                    type='info'
                    showIcon
                    message={t('catalog.limitations')}
                    description={
                        <ul className={styles.notes}>
                            {entry.limitations.map((note, index) => (
                                <li key={index}>{note}</li>
                            ))}
                        </ul>
                    }
                />
            ) : null}
            <EntryContent entry={entry} />
            <section aria-label={t('catalog.relationships')}>
                <Typography.Title level={4}>
                    {t('catalog.relationships')}
                </Typography.Title>
                {hasRelationships ? (
                    <Space wrap>
                        {entry.references.map((reference) => (
                            <ReferenceButton
                                key={catalogReferenceKey(reference)}
                                reference={reference}
                                entries={entries}
                                onSelect={onSelect}
                            />
                        ))}
                    </Space>
                ) : (
                    <Typography.Text type='secondary'>
                        {t('catalog.noRelationships')}
                    </Typography.Text>
                )}
            </section>
        </div>
    );
}

function EntryContent({ entry }: { entry: AdminAiCatalogEntry }) {
    const t = useTranslate();
    if (entry.kind === 'prompt') {
        return (
            <>
                <Typography.Paragraph type='secondary'>
                    {t('catalog.source')}: <code>{entry.sourcePath}</code>
                </Typography.Paragraph>
                <TextBlock
                    label={t('catalog.promptContent')}
                    text={entry.content}
                />
            </>
        );
    }

    if (entry.kind === 'tool') {
        return <ToolSchemas entry={entry} />;
    }

    if (entry.staticInstructions.length === 0) {
        return (
            <Empty
                description={t('catalog.noStaticInstructions')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
        );
    }

    return (
        <section
            aria-label={t('catalog.staticInstructions')}
            className={styles.stack}
        >
            <Typography.Title level={4}>
                {t('catalog.staticInstructions')}
            </Typography.Title>
            {entry.staticInstructions.map((instruction, index) => (
                <TextBlock
                    key={index}
                    label={instruction.label}
                    text={instruction.text}
                />
            ))}
        </section>
    );
}

function ToolSchemas({
    entry,
}: {
    entry: Extract<AdminAiCatalogEntry, { kind: 'tool' }>;
}) {
    const t = useTranslate();
    const definitions = [
        { label: t('catalog.inputSchema'), schema: entry.inputSchema },
        { label: t('catalog.outputSchema'), schema: entry.outputSchema },
        {
            label: t('catalog.contextSchema'),
            schema: entry.requestContextSchema,
        },
    ];

    return (
        <div className={styles.stack}>
            {definitions.map(({ label, schema }, index) => (
                <details
                    key={label}
                    open={index === 0}
                    className={styles.schema}
                >
                    <summary>{label}</summary>
                    {schema === null ? (
                        <Typography.Paragraph type='secondary'>
                            {t('catalog.noSchema')}
                        </Typography.Paragraph>
                    ) : (
                        <TextBlock
                            label={label}
                            text={JSON.stringify(schema, null, 2)}
                            hideTitle
                        />
                    )}
                </details>
            ))}
        </div>
    );
}

function TextBlock({
    label,
    text,
    hideTitle = false,
}: {
    label: string;
    text: string;
    hideTitle?: boolean;
}) {
    const t = useTranslate();
    const copyOptions = { text };

    return (
        <section aria-label={label} className={styles.textBlock}>
            <div className={styles.blockHeading}>
                {!hideTitle ? (
                    <Typography.Title level={4}>{label}</Typography.Title>
                ) : null}
                <Typography.Text copyable={copyOptions}>
                    {t('catalog.copy')}
                </Typography.Text>
            </div>
            <pre className={styles.code} tabIndex={0} aria-label={label}>
                {text}
            </pre>
        </section>
    );
}

function ReferenceButton({
    reference,
    entries,
    onSelect,
}: {
    reference: AdminAiCatalogReference;
    entries: readonly AdminAiCatalogSummary[];
    onSelect(reference: AdminAiCatalogReference): void;
}) {
    const t = useTranslate();
    const summary = entries.find(
        (candidate) =>
            candidate.kind === reference.kind && candidate.id === reference.id,
    );
    const name = summary?.name ?? reference.id;
    const label =
        reference.kind === 'tool' && name !== reference.id
            ? `${name} (${reference.id})`
            : name;
    const handleSelect = () => onSelect(reference);

    return (
        <Button className={styles.referenceButton ?? ''} onClick={handleSelect}>
            {t(`catalog.kind.${reference.kind}`)}: {label}
        </Button>
    );
}
