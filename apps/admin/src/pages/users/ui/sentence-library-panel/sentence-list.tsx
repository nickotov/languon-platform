import { EyeOutlined } from '@ant-design/icons';
import type { AdminSentenceLibraryItem } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Button, Checkbox, Empty, Space, Spin, Tag, Typography } from 'antd';

import styles from './sentence-library-panel.module.css';

type Props = {
    items: AdminSentenceLibraryItem[];
    selected: string[];
    loading: boolean;
    onSelect(value: string[]): void;
    onPreview(id: string): void;
};

export function SentenceList({
    items,
    selected,
    loading,
    onSelect,
    onPreview,
}: Props) {
    const t = useTranslate();
    const allSelected = items.length > 0 && selected.length === items.length;
    const someSelected = selected.length > 0 && !allSelected;
    const selectAll = () =>
        onSelect(allSelected ? [] : items.map((item) => item.exerciseId));
    if (loading)
        return (
            <div className={styles.empty}>
                <Spin aria-label={t('sentences.loading')} />
            </div>
        );
    if (!items.length)
        return (
            <Empty
                className={styles.empty}
                description={t('sentences.empty')}
            />
        );
    return (
        <div>
            <div className={styles.listHeading}>
                <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={selectAll}
                >
                    {t('sentences.selectPage')}
                </Checkbox>
                <Typography.Text type='secondary'>
                    {t('sentences.pageCount', { count: items.length })}
                </Typography.Text>
            </div>
            <ul className={styles.list}>
                {items.map((item) => (
                    <SentenceRow
                        item={item}
                        key={item.exerciseId}
                        onPreview={onPreview}
                        onSelect={onSelect}
                        selected={selected}
                    />
                ))}
            </ul>
        </div>
    );
}

function SentenceRow({
    item,
    selected,
    onSelect,
    onPreview,
}: Omit<Props, 'items' | 'loading'> & { item: AdminSentenceLibraryItem }) {
    const t = useTranslate();
    const checked = selected.includes(item.exerciseId);
    const toggle = () =>
        onSelect(
            checked
                ? selected.filter((id) => id !== item.exerciseId)
                : [...selected, item.exerciseId],
        );
    const preview = () => onPreview(item.exerciseId);
    const selectLabel = t('sentences.selectSentence', {
        text: item.sourceText,
    });
    const languagePair = `${item.sourceLanguage.toUpperCase()} → ${item.targetLanguage.toUpperCase()}`;
    return (
        <li className={styles.row}>
            <Checkbox
                aria-label={selectLabel}
                checked={checked}
                onChange={toggle}
            />
            <div className={styles.rowContent}>
                <Typography.Text className={styles.source}>
                    {item.sourceText}
                </Typography.Text>
                <Space size={[4, 6]} wrap>
                    <Tag color='purple'>{languagePair}</Tag>
                    <Tag>{t(`sentences.${item.sharing}`)}</Tag>
                    {item.personalArchivedAt ? (
                        <Tag color='gold'>
                            {t('sentences.personalArchived')}
                        </Tag>
                    ) : null}
                    {item.globalArchivedAt ? (
                        <Tag color='red'>{t('sentences.globalArchived')}</Tag>
                    ) : null}
                    {item.creatorArchived ? (
                        <Tag>{t('sentences.generatorArchived')}</Tag>
                    ) : null}
                    {item.contentState === 'outdated' ? (
                        <Tag color='orange'>{t('sentences.outdated')}</Tag>
                    ) : null}
                    <Typography.Text type='secondary'>
                        {new Date(item.createdAt).toLocaleString()}
                    </Typography.Text>
                </Space>
            </div>
            <Button
                aria-label={t('sentences.previewSentence', {
                    text: item.sourceText,
                })}
                icon={<EyeOutlined aria-hidden />}
                onClick={preview}
            >
                {t('sentences.preview')}
            </Button>
        </li>
    );
}
