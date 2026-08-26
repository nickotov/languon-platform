'use client';

import type { DictionaryExportFormat } from '@languon/contracts';

import { useI18n } from '@/fsd/shared/i18n';
import { Button, Card, InlineAlert } from '@/fsd/shared/ui';

import styles from './dictionary-export-panel.module.css';

export function DictionaryExportPanel({
    error,
    onExport,
    pending,
}: {
    error?: string | null;
    onExport(format: DictionaryExportFormat): Promise<void>;
    pending: boolean;
}) {
    const { t } = useI18n();
    const formats: Array<{
        format: DictionaryExportFormat;
        help: string;
        label: string;
    }> = [
        {
            format: 'quizlet-text',
            help: t('dictionary.interchange.quizletTextHelp'),
            label: t('dictionary.interchange.copyQuizlet'),
        },
        {
            format: 'quizlet-csv',
            help: t('dictionary.interchange.quizletCsvHelp'),
            label: t('dictionary.interchange.downloadQuizletCsv'),
        },
        {
            format: 'languon-csv:v1',
            help: t('dictionary.interchange.languonCsvHelp'),
            label: t('dictionary.interchange.downloadLanguonCsv'),
        },
    ];
    return (
        <section className={styles.section}>
            <div>
                <p className={styles.eyebrow}>
                    {t('dictionary.interchange.exportEyebrow')}
                </p>
                <h3>{t('dictionary.interchange.exportTitle')}</h3>
                <p>{t('dictionary.interchange.exportHelp')}</p>
            </div>
            {error ? <InlineAlert tone='danger'>{error}</InlineAlert> : null}
            <div className={styles.formats}>
                {formats.map((item) => (
                    <Card className={styles.format} key={item.format}>
                        <div>
                            <h4>{item.label}</h4>
                            <p>{item.help}</p>
                        </div>
                        <Button
                            disabled={pending}
                            onClick={() =>
                                void onExport(item.format).catch(
                                    () => undefined,
                                )
                            }
                            type='button'
                            variant='secondary'
                        >
                            {item.label}
                        </Button>
                    </Card>
                ))}
            </div>
        </section>
    );
}
