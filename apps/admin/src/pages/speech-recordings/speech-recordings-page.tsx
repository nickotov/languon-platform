import { useState } from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { useLogout, useTranslate } from '@refinedev/core';
import type { AdminSpeechRecording } from '@languon/contracts';
import { useRecordings } from './hooks/use-recordings';
import { RecordingFiltersForm } from './ui/recording-filters/recording-filters';
import { RecordingTable } from './ui/recording-table/recording-table';
import { RecordingPreview } from './ui/recording-preview/recording-preview';
import { RecordingDeleteDialog } from './ui/recording-delete-dialog/recording-delete-dialog';
import styles from '../shared/page.module.css';

export function SpeechRecordingsPage() {
    const t = useTranslate();
    const logout = useLogout();
    const library = useRecordings();
    const [preview, setPreview] = useState<AdminSpeechRecording | null>(null);
    const closePreview = () => setPreview(null);
    const signIn = () => logout.mutate();
    const deletionDisabled =
        library.selected.length === 0 ||
        library.loading ||
        library.error !== null;
    return (
        <main className={styles.stack}>
            <header className={styles.heading}>
                <div>
                    <Typography.Text className={styles.eyebrow}>
                        {t('speech.eyebrow')}
                    </Typography.Text>
                    <Typography.Title>{t('speech.title')}</Typography.Title>
                </div>
                <Typography.Text type='secondary'>
                    {t('speech.retention')}
                </Typography.Text>
            </header>
            <Card>
                <RecordingFiltersForm onApply={library.updateFilters} />
            </Card>
            {library.error ? (
                <Alert
                    type='error'
                    showIcon
                    message={library.error.message}
                    action={
                        <Button onClick={library.refresh}>
                            {t('actions.retry')}
                        </Button>
                    }
                />
            ) : null}
            <Space wrap>
                <Button onClick={library.refresh}>
                    {t('actions.refresh')}
                </Button>
                <Button
                    danger
                    onClick={library.openDelete}
                    disabled={deletionDisabled}
                >
                    {t('speech.deleteSelected', {
                        count: library.selected.length,
                    })}
                </Button>
            </Space>
            <Card className={styles.tableCard}>
                <RecordingTable
                    recordings={library.recordings}
                    total={library.total}
                    page={library.page}
                    loading={library.loading}
                    selected={library.selected}
                    onSelect={library.setSelected}
                    onPage={library.changePage}
                    onPreview={setPreview}
                />
            </Card>
            <RecordingPreview recording={preview} onClose={closePreview} />
            <RecordingDeleteDialog
                recordings={library.confirmation}
                pending={library.deleting}
                error={library.mutationError}
                blocked={library.mutationBlocked}
                onClose={library.closeDelete}
                onSubmit={library.submitDelete}
                onReview={library.reviewAgain}
                onSignIn={signIn}
            />
        </main>
    );
}
