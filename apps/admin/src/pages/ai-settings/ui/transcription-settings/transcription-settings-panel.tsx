import { useLogout, useTranslate } from '@refinedev/core';
import {
    Alert,
    Button,
    Card,
    Descriptions,
    Skeleton,
    Space,
    Tag,
    Typography,
} from 'antd';
import type {
    KnowledgeTranscriptionAdminConfig,
    KnowledgeTranscriptionAdminReadiness,
} from '@languon/contracts';
import { useTranscriptionSettings } from '../../hooks/use-transcription-settings';
import { TranscriptionSettingsForm } from './transcription-settings-form';
import styles from '../../ai-settings-page.module.css';
import local from './transcription-settings.module.css';

function Configuration({
    config,
}: {
    config: KnowledgeTranscriptionAdminConfig | null;
}) {
    const t = useTranslate();
    if (!config)
        return (
            <Typography.Text>
                {t('transcription.noConfiguration')}
            </Typography.Text>
        );
    return (
        <Descriptions
            column={1}
            size='small'
            items={[
                {
                    key: 'enabled',
                    label: t('transcription.enabled'),
                    children: config.enabled
                        ? t('transcription.on')
                        : t('transcription.off'),
                },
                {
                    key: 'tariff',
                    label: t('transcription.credits'),
                    children: config.creditsPerMinute ?? '—',
                },
                {
                    key: 'duration',
                    label: t('transcription.maximumDuration'),
                    children: config.maximumDurationMs,
                },
                {
                    key: 'bytes',
                    label: t('transcription.maximumBytes'),
                    children: config.maximumBytes,
                },
                {
                    key: 'cost',
                    label: t('transcription.maximumCost'),
                    children: config.maximumProviderCostMicros,
                },
                {
                    key: 'sharing',
                    label: t('transcription.dataSharingEvidence'),
                    children: config.dataSharingEvidence ?? '—',
                },
                {
                    key: 'billing',
                    label: t('transcription.billingEvidence'),
                    children: config.billingEvidence ?? '—',
                },
            ]}
        />
    );
}
function Readiness({
    readiness,
}: {
    readiness: KnowledgeTranscriptionAdminReadiness;
}) {
    const t = useTranslate();
    const type = readiness.ready ? 'success' : 'warning';
    const description = readiness.reasons
        .map((reason) => t(`transcription.${reason}`))
        .join(' · ');
    return (
        <Alert
            type={type}
            showIcon
            message={
                readiness.ready
                    ? t('transcription.ready')
                    : t('transcription.notReady')
            }
            description={description}
        />
    );
}
export function TranscriptionSettingsPanel() {
    const t = useTranslate();
    const settings = useTranscriptionSettings();
    const logout = useLogout();
    function refresh() {
        settings.refresh();
    }
    function signIn() {
        logout.mutate();
    }
    const canApply =
        settings.preview !== null &&
        (!settings.preview.request.config.enabled ||
            settings.preview.readiness.ready);
    const revision = settings.state?.version ?? 0;
    return (
        <Card
            className={local.root ?? ''}
            title={t('transcription.title')}
            role='region'
            aria-label={t('transcription.title')}
        >
            <div className={`${styles.configuration} ${local.body}`}>
                <Typography.Paragraph>
                    {t('transcription.description')}
                </Typography.Paragraph>
                <Typography.Text>{t('transcription.model')}</Typography.Text>
                {settings.error ? (
                    <Alert
                        type='error'
                        showIcon
                        message={t('transcription.error')}
                        action={
                            <Space wrap>
                                <Button
                                    onClick={refresh}
                                    disabled={settings.pending}
                                >
                                    {t('transcription.retry')}
                                </Button>
                                <Button
                                    onClick={signIn}
                                    disabled={settings.pending}
                                >
                                    {t('transcription.signIn')}
                                </Button>
                            </Space>
                        }
                    />
                ) : null}
                {settings.published ? (
                    <Alert
                        type='success'
                        showIcon
                        message={t('transcription.published')}
                    />
                ) : null}
                <Skeleton active loading={settings.loading}>
                    {settings.state ? (
                        <>
                            <div>
                                <Tag>
                                    {t('transcription.currentRevision')}:{' '}
                                    {revision}
                                </Tag>
                            </div>
                            <Readiness readiness={settings.state.readiness} />
                            <TranscriptionSettingsForm
                                state={settings.state}
                                pending={settings.pending}
                                onReview={settings.review}
                                onChange={settings.clearPreview}
                            />
                        </>
                    ) : null}
                </Skeleton>
                {settings.preview ? (
                    <Card title={t('transcription.reviewTitle')}>
                        <div className={styles.configuration}>
                            <Typography.Paragraph>
                                {t('transcription.reviewHelp')}
                            </Typography.Paragraph>
                            <div className={styles.providerGrid}>
                                <Card title={t('transcription.before')}>
                                    <Configuration
                                        config={settings.state?.current ?? null}
                                    />
                                </Card>
                                <Card title={t('transcription.after')}>
                                    <Configuration
                                        config={settings.preview.request.config}
                                    />
                                </Card>
                            </div>
                            <Readiness readiness={settings.preview.readiness} />
                            <Typography.Paragraph>
                                {settings.preview.request.reason}
                            </Typography.Paragraph>
                            <Button
                                type='primary'
                                disabled={!canApply}
                                loading={settings.pending}
                                onClick={settings.apply}
                            >
                                {t('transcription.publish')}
                            </Button>
                        </div>
                    </Card>
                ) : null}
            </div>
        </Card>
    );
}
