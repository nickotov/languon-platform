import type { AdminSentenceLibraryDetail } from '@languon/contracts';
import { useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Descriptions,
    Drawer,
    Empty,
    Space,
    Spin,
    Tag,
    Typography,
} from 'antd';
import { useEffect, useState } from 'react';

import { adminApi } from '@/shared/api/admin-api';
import { normalizeSentenceError } from '../../hooks/use-sentence-library';
import styles from './sentence-library-panel.module.css';

type Props = {
    userId: string;
    dictionaryId: string;
    exerciseId: string | null;
    onClose(): void;
};
export function SentenceDetail({
    userId,
    dictionaryId,
    exerciseId,
    onClose,
}: Props) {
    const t = useTranslate();
    const [detail, setDetail] = useState<AdminSentenceLibraryDetail | null>(
        null,
    );
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(false);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        setDetail(null);
        setError(null);
        if (!exerciseId) return;
        const controller = new AbortController();
        setLoading(true);
        void adminApi
            .sentence(userId, dictionaryId, exerciseId, controller.signal)
            .then((response) => {
                if (!controller.signal.aborted) setDetail(response);
            })
            .catch((caught: unknown) => {
                if (!controller.signal.aborted)
                    setError(normalizeSentenceError(caught));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [dictionaryId, exerciseId, revision, userId]);
    const retry = () => setRevision((value) => value + 1);
    const descriptions = detail
        ? [
              {
                  key: 'creator',
                  label: t('sentences.creatorId'),
                  children: (
                      <Typography.Text copyable>
                          {detail.item.creatorId}
                      </Typography.Text>
                  ),
              },
              {
                  key: 'created',
                  label: t('sentences.created'),
                  children: new Date(detail.item.createdAt).toLocaleString(),
              },
              {
                  key: 'version',
                  label: t('user.version'),
                  children: detail.item.version,
              },
              {
                  key: 'id',
                  label: t('sentences.exerciseId'),
                  children: (
                      <Typography.Text copyable>
                          {detail.item.exerciseId}
                      </Typography.Text>
                  ),
              },
          ]
        : [];
    return (
        <Drawer
            className={styles.drawer}
            destroyOnHidden
            onClose={onClose}
            open={exerciseId !== null}
            title={t('sentences.previewTitle')}
            width={620}
        >
            <Space direction='vertical' size='large' className={styles.full}>
                <Alert
                    message={t('sentences.previewNotice')}
                    showIcon
                    type='info'
                />
                {loading ? <Spin aria-label={t('sentences.loading')} /> : null}
                {error ? (
                    <Alert
                        action={
                            <Button onClick={retry}>
                                {t('actions.retry')}
                            </Button>
                        }
                        message={error.message}
                        showIcon
                        type='error'
                    />
                ) : null}
                {detail ? (
                    <>
                        <div className={styles.example}>
                            <Typography.Text type='secondary'>
                                {detail.item.sourceLanguage.toUpperCase()}
                            </Typography.Text>
                            <Typography.Title level={4}>
                                {detail.exercise.sourceText}
                            </Typography.Title>
                        </div>
                        <div className={styles.reference}>
                            <Typography.Text type='secondary'>
                                {t('sentences.reference')} ·{' '}
                                {detail.item.targetLanguage.toUpperCase()}
                            </Typography.Text>
                            <Typography.Paragraph>
                                {detail.referenceTranslation}
                            </Typography.Paragraph>
                        </div>
                        <section>
                            <Typography.Title level={5}>
                                {t('sentences.hints')}
                            </Typography.Title>
                            {detail.exercise.hints.length ? (
                                detail.exercise.hints.map((hint) => {
                                    const segments =
                                        detail.exercise.segments.filter(
                                            (segment) =>
                                                segment.target?.hintId ===
                                                    hint.id ||
                                                segment.contextualHintId ===
                                                    hint.id,
                                        );
                                    const phrase = segments
                                        .map((segment) => segment.text)
                                        .join(' · ');
                                    const hintKind =
                                        hint.kind === 'contextual'
                                            ? 'contextual'
                                            : 'dictionaryHint';
                                    return (
                                        <div
                                            className={styles.hint}
                                            key={hint.id}
                                        >
                                            <Space wrap>
                                                <Typography.Text strong>
                                                    {phrase}
                                                </Typography.Text>
                                                <Tag>
                                                    {t(`sentences.${hintKind}`)}
                                                </Tag>
                                            </Space>
                                            <Typography.Paragraph>
                                                {hint.text}
                                            </Typography.Paragraph>
                                        </div>
                                    );
                                })
                            ) : (
                                <Empty description={t('sentences.noHints')} />
                            )}
                        </section>
                        <Descriptions
                            column={1}
                            items={descriptions}
                            size='small'
                        />
                    </>
                ) : null}
            </Space>
        </Drawer>
    );
}
