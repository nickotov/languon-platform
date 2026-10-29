import { useEffect, useState } from 'react';
import { useTranslate } from '@refinedev/core';
import { Alert, Button, Checkbox, Form, Input, Select, Switch } from 'antd';
import {
    KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
    KnowledgeTranscriptionAdminPreviewRequestSchema,
    type KnowledgeTranscriptionAdminPreviewRequest,
    type KnowledgeTranscriptionAdminState,
} from '@languon/contracts';
import styles from '../../ai-settings-page.module.css';
import local from './transcription-settings.module.css';

type Values = {
    enabled: boolean;
    providerPriceRevisionId?: string | undefined;
    creditsPerMinute?: string | undefined;
    maximumDurationMs: string;
    maximumBytes: string;
    maximumProviderCostMicros: string;
    billingRulesVerified: boolean;
    dataSharingDisabled: boolean;
    dataSharingEvidence?: string | undefined;
    billingEvidence?: string | undefined;
    reason: string;
};
export function TranscriptionSettingsForm({
    state,
    pending,
    onReview,
    onChange,
}: {
    state: KnowledgeTranscriptionAdminState;
    pending: boolean;
    onReview(input: KnowledgeTranscriptionAdminPreviewRequest): Promise<void>;
    onChange(): void;
}) {
    const t = useTranslate();
    const [form] = Form.useForm<Values>();
    const [invalid, setInvalid] = useState(false);
    useEffect(() => {
        const current = state.current;
        form.resetFields();
        form.setFieldsValue({
            enabled: current?.enabled ?? false,
            providerPriceRevisionId:
                current?.providerPriceRevisionId ?? undefined,
            creditsPerMinute: current?.creditsPerMinute ?? undefined,
            maximumDurationMs: String(current?.maximumDurationMs ?? 1_800_000),
            maximumBytes: String(current?.maximumBytes ?? 5_242_880),
            maximumProviderCostMicros: current
                ? String(current.maximumProviderCostMicros)
                : '',
            billingRulesVerified: current?.billingRulesVerified ?? false,
            // Every publication needs a fresh operator check; billing edits cannot renew it implicitly.
            dataSharingDisabled: false,
            dataSharingEvidence: undefined,
            billingEvidence: current?.billingEvidence ?? undefined,
            reason: '',
        });
        setInvalid(false);
    }, [state.version, form, state.current]);
    function changed() {
        setInvalid(false);
        onChange();
    }
    async function review(values: Values) {
        const result =
            KnowledgeTranscriptionAdminPreviewRequestSchema.safeParse({
                revisionId: crypto.randomUUID(),
                expectedVersion: state.version,
                reason: values.reason,
                config: {
                    enabled: values.enabled,
                    providerPriceRevisionId:
                        values.providerPriceRevisionId ?? null,
                    creditsPerMinute: values.creditsPerMinute?.trim() || null,
                    maximumDurationMs: Number(values.maximumDurationMs),
                    maximumBytes: Number(values.maximumBytes),
                    maximumProviderCostMicros: Number(
                        values.maximumProviderCostMicros,
                    ),
                    processingControlsRevision:
                        KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
                    dataSharingDisabled: values.dataSharingDisabled,
                    dataSharingEvidence:
                        values.dataSharingEvidence?.trim() || null,
                    billingRulesVerified: values.billingRulesVerified,
                    billingEvidence: values.billingEvidence?.trim() || null,
                },
            });
        if (!result.success) {
            setInvalid(true);
            return;
        }
        await onReview(result.data);
    }
    const options = state.prices.map((price) => ({
        value: price.id,
        label: `${price.modelId} · v${price.version} · ${price.sourceReference}`,
    }));
    const required = [{ required: true, message: t('transcription.required') }];
    return (
        <Form
            className={local.form}
            form={form}
            layout='vertical'
            disabled={pending}
            onFinish={review}
            onValuesChange={changed}
        >
            {invalid ? (
                <Alert
                    type='error'
                    showIcon
                    message={t('transcription.invalid')}
                />
            ) : null}
            <Form.Item
                name='enabled'
                label={t('transcription.enabled')}
                valuePropName='checked'
            >
                <Switch />
            </Form.Item>
            <Form.Item
                name='providerPriceRevisionId'
                label={t('transcription.providerPrice')}
            >
                <Select
                    className={local.control ?? ''}
                    allowClear
                    options={options}
                    placeholder={t('transcription.selectPrice')}
                />
            </Form.Item>
            <Form.Item
                name='creditsPerMinute'
                label={t('transcription.credits')}
                extra={t('transcription.creditsHelp')}
            >
                <Input inputMode='decimal' maxLength={17} />
            </Form.Item>
            <div className={styles.formGrid}>
                <Form.Item
                    name='maximumDurationMs'
                    label={t('transcription.maximumDuration')}
                    rules={required}
                >
                    <Input type='number' min={1} max={1_800_000} step={1} />
                </Form.Item>
                <Form.Item
                    name='maximumBytes'
                    label={t('transcription.maximumBytes')}
                    rules={required}
                >
                    <Input type='number' min={1} max={5_242_880} step={1} />
                </Form.Item>
                <Form.Item
                    name='maximumProviderCostMicros'
                    label={t('transcription.maximumCost')}
                    rules={required}
                >
                    <Input type='number' min={1} max={2_147_483_647} step={1} />
                </Form.Item>
            </div>
            <Form.Item
                name='dataSharingDisabled'
                valuePropName='checked'
                extra={t('transcription.dataSharingHelp')}
            >
                <Checkbox>{t('transcription.dataSharingDisabled')}</Checkbox>
            </Form.Item>
            <Form.Item
                name='dataSharingEvidence'
                label={t('transcription.dataSharingEvidence')}
            >
                <Input.TextArea maxLength={2000} rows={3} />
            </Form.Item>
            <Form.Item
                name='billingRulesVerified'
                valuePropName='checked'
                extra={t('transcription.billingHelp')}
            >
                <Checkbox>{t('transcription.billingVerified')}</Checkbox>
            </Form.Item>
            <Form.Item
                name='billingEvidence'
                label={t('transcription.billingEvidence')}
            >
                <Input.TextArea maxLength={2000} rows={3} />
            </Form.Item>
            <Form.Item
                name='reason'
                label={t('transcription.reason')}
                rules={[
                    ...required,
                    {
                        min: 5,
                        max: 500,
                        message: t('transcription.reasonHelp'),
                    },
                ]}
            >
                <Input.TextArea maxLength={500} rows={2} />
            </Form.Item>
            <Button type='primary' htmlType='submit' loading={pending}>
                {t('transcription.preview')}
            </Button>
        </Form>
    );
}
