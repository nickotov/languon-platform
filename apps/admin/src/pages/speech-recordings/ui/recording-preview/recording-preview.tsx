import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Typography } from 'antd';
import { useTranslate } from '@refinedev/core';
import type { AdminSpeechRecording } from '@languon/contracts';
import { adminApi } from '@/shared/api/admin-api';

export function RecordingPreview({
    recording,
    onClose,
}: {
    recording: AdminSpeechRecording | null;
    onClose(): void;
}) {
    const t = useTranslate();
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [requested, setRequested] = useState(false);
    useEffect(() => {
        setRequested(false);
        setError(null);
    }, [recording?.id]);
    useEffect(() => {
        if (!recording || !requested) return;
        const controller = new AbortController();
        let objectUrl: string | null = null;
        setLoading(true);
        adminApi
            .speechRecordingContent(recording.id, controller.signal)
            .then((blob) => {
                if (controller.signal.aborted) return;
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            })
            .catch((caught: unknown) => {
                if (!controller.signal.aborted)
                    setError(
                        caught instanceof Error
                            ? caught.message
                            : t('speech.previewFailed'),
                    );
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            setUrl(null);
        };
    }, [recording, requested, t]);
    const handleLoad = () => setRequested(true);
    const ready = recording?.state === 'ready';
    return (
        <Modal
            title={t('speech.preview')}
            open={recording !== null}
            onCancel={onClose}
            footer={null}
            destroyOnHidden
        >
            <Typography.Paragraph
                dir='auto'
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
                {recording?.text}
            </Typography.Paragraph>
            {error ? <Alert type='error' showIcon message={error} /> : null}
            {url ? (
                <audio
                    controls
                    src={url}
                    aria-label={t('speech.audioPreview')}
                />
            ) : (
                <Button
                    onClick={handleLoad}
                    loading={loading}
                    disabled={!ready || requested}
                >
                    {t('speech.loadAudio')}
                </Button>
            )}
        </Modal>
    );
}
