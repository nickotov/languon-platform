import type { AdminSentenceLibraryOperation } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Space, Typography } from 'antd';
import { useState } from 'react';

import type { useSentenceLibrary } from '../../hooks/use-sentence-library';
import { useSentenceMutation } from '../../hooks/use-sentence-mutation';
import { canDeleteSentences } from '../../lib/sentence-selection';
import { SentenceActions } from './sentence-actions';
import { SentenceDetail } from './sentence-detail';
import { SentenceFilters } from './sentence-filters';
import { SentenceList } from './sentence-list';
import { SentenceMutationDialog } from './sentence-mutation-dialog';
import styles from './sentence-library-panel.module.css';

type Props = {
    userId: string;
    mutable: boolean;
    library: ReturnType<typeof useSentenceLibrary>;
};
export function SentenceWorkspace({ userId, mutable, library }: Props) {
    const t = useTranslate();
    const [previewId, setPreviewId] = useState<string | null>(null);
    const refreshAfterMutation = () => {
        library.reload();
        library.retryDiscovery();
    };
    const mutation = useSentenceMutation(
        userId,
        library.dictionaryId,
        refreshAfterMutation,
    );
    const closePreview = () => setPreviewId(null);
    const selected = (operation: AdminSentenceLibraryOperation) =>
        mutation.openSelected(operation, library.items, library.selected);
    const all = (operation: AdminSentenceLibraryOperation) => {
        void mutation.openAll(operation, library.filters);
    };
    const disabled =
        !mutable ||
        library.loading ||
        mutation.pending ||
        mutation.snapshotPending ||
        !!library.error;
    const canDelete = canDeleteSentences(library.items, library.selected);
    const canDeleteAll = library.filters.creatorArchived === true;
    return (
        <Space direction='vertical' size='large' className={styles.full}>
            <SentenceFilters
                disabled={mutation.snapshotPending || mutation.pending}
                onChange={library.changeFilters}
                value={library.filters}
            />
            <Alert
                message={t('sentences.deleteEligibility')}
                showIcon
                type='info'
            />
            {!mutable ? (
                <Alert
                    message={t('sentences.readOnly')}
                    showIcon
                    type='warning'
                />
            ) : null}
            <SentenceActions
                canDelete={canDelete}
                canDeleteAll={canDeleteAll}
                count={library.selected.length}
                disabled={disabled}
                onAll={all}
                onSelected={selected}
            />
            {library.error ? (
                <Alert
                    action={
                        <Button onClick={library.reload}>
                            {t('actions.retry')}
                        </Button>
                    }
                    message={library.error.message}
                    showIcon
                    type='error'
                />
            ) : null}
            {mutation.error && !mutation.confirmation ? (
                <Alert message={mutation.error.message} showIcon type='error' />
            ) : null}
            {mutation.snapshotPending ? (
                <Typography.Text role='status'>
                    {t('sentences.preparingSnapshot')}
                </Typography.Text>
            ) : null}
            <SentenceList
                items={library.items}
                loading={library.loading}
                onPreview={setPreviewId}
                onSelect={library.setSelected}
                selected={library.selected}
            />
            <div className={styles.pagination}>
                <Button
                    disabled={!library.cursor || library.loading}
                    onClick={library.firstPage}
                >
                    {t('sentences.firstPage')}
                </Button>
                <Button
                    disabled={!library.nextCursor || library.loading}
                    onClick={library.nextPage}
                >
                    {t('sentences.nextPage')}
                </Button>
            </div>
            <SentenceDetail
                dictionaryId={library.dictionaryId}
                exerciseId={previewId}
                onClose={closePreview}
                userId={userId}
            />
            <SentenceMutationDialog
                mutation={mutation}
                onReload={library.reload}
            />
        </Space>
    );
}
