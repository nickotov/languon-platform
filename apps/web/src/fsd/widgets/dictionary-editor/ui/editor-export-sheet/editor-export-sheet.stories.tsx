import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
    QueryClient,
    QueryClientProvider,
    useMutation,
} from '@tanstack/react-query';
import { useState } from 'react';
import type { DictionaryExportFormat } from '@languon/contracts';
import { I18nProvider, useI18n } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { Button } from '@/fsd/shared/ui';
import { EditorExportSheet } from './editor-export-sheet';

function ExportExample() {
    const { t } = useI18n();
    const [interchangeOpen, setInterchangeOpen] = useState<
        'export' | 'import' | null
    >('export');
    const interchangeExportAction = useMutation<
        'copied' | 'downloaded' | null,
        Error,
        DictionaryExportFormat
    >({
        mutationFn: async (format) =>
            format === 'quizlet-text' ? 'copied' : 'downloaded',
    });

    function open() {
        setInterchangeOpen('export');
    }

    return (
        <>
            <Button onClick={open}>
                {t('dictionary.interchange.exportTitle')}
            </Button>
            <EditorExportSheet
                model={{
                    t,
                    interchangeOpen,
                    setInterchangeOpen,
                    interchangeExportAction,
                }}
            />
        </>
    );
}

function Example() {
    const [client] = useState(() => new QueryClient());

    return (
        <QueryClientProvider client={client}>
            <I18nProvider locale='en' messages={en}>
                <ExportExample />
            </I18nProvider>
        </QueryClientProvider>
    );
}

export default {
    title: 'Widgets/Dictionary editor/Export sheet',
} satisfies Meta;
export const Ready: StoryObj = { render: () => <Example /> };
