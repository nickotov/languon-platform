import { DeleteOutlined, MoreOutlined } from '@ant-design/icons';
import type { AdminSentenceLibraryOperation } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Button, Dropdown, Space, Typography, type MenuProps } from 'antd';

import { operationKey } from './sentence-mutation-dialog';
import styles from './sentence-library-panel.module.css';

type Props = {
    count: number;
    disabled: boolean;
    canDelete: boolean;
    canDeleteAll: boolean;
    onSelected(operation: AdminSentenceLibraryOperation): void;
    onAll(operation: AdminSentenceLibraryOperation): void;
};
export function SentenceActions({
    count,
    disabled,
    canDelete,
    canDeleteAll,
    onSelected,
    onAll,
}: Props) {
    const t = useTranslate();
    const archive = () => onSelected('archive');
    const restore = () => onSelected('restore');
    const globalArchive = () => onSelected('global-archive');
    const globalRestore = () => onSelected('global-restore');
    const remove = () => onSelected('delete');
    const operations: AdminSentenceLibraryOperation[] = [
        'archive',
        'restore',
        'global-archive',
        'global-restore',
        'delete',
    ];
    const menu: MenuProps = {
        items: operations.map((operation) => ({
            key: operation,
            label: t(operationKey(operation)),
            danger: operation === 'delete',
            disabled: disabled || (operation === 'delete' && !canDeleteAll),
        })),
        onClick: ({ key }) => onAll(key as AdminSentenceLibraryOperation),
    };
    const selectionDisabled = disabled || count === 0;
    return (
        <div className={styles.actions}>
            <Typography.Text strong>
                {t('sentences.selectedCount', { count })}
            </Typography.Text>
            <Space wrap size='small'>
                <Button disabled={selectionDisabled} onClick={archive}>
                    {t('sentences.archive')}
                </Button>
                <Button disabled={selectionDisabled} onClick={restore}>
                    {t('sentences.restore')}
                </Button>
                <Button disabled={selectionDisabled} onClick={globalArchive}>
                    {t('sentences.globalArchive')}
                </Button>
                <Button disabled={selectionDisabled} onClick={globalRestore}>
                    {t('sentences.globalRestore')}
                </Button>
                <Button
                    danger
                    disabled={selectionDisabled || !canDelete}
                    icon={<DeleteOutlined aria-hidden />}
                    onClick={remove}
                >
                    {t('sentences.delete')}
                </Button>
                <Dropdown menu={menu} trigger={['click']}>
                    <Button
                        disabled={disabled}
                        icon={<MoreOutlined aria-hidden />}
                    >
                        {t('sentences.allMatching')}
                    </Button>
                </Dropdown>
            </Space>
        </div>
    );
}
