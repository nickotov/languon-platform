import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { I18nProvider, type Locale } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import { fr } from '@/fsd/shared/i18n/messages/fr';
import { es } from '@/fsd/shared/i18n/messages/es';
import { Button } from '@/fsd/shared/ui';
import { EndSessionDialog } from './end-session-dialog';

const messages = { en, ru, fr, es };

function Preview({ locale }: { locale: Locale }) {
    const [open, setOpen] = useState(true);

    function close() {
        setOpen(false);
    }

    function show() {
        setOpen(true);
    }

    return (
        <I18nProvider locale={locale} messages={messages[locale]}>
            <Button onClick={show}>Open confirmation</Button>
            <EndSessionDialog
                open={open}
                signedIn
                saving={false}
                onKeep={close}
                onEnd={close}
            />
        </I18nProvider>
    );
}

const meta = {
    title: 'Training/End session dialog',
    render: Preview,
    args: { locale: 'en' },
} satisfies Meta<typeof Preview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = {};
export const Russian: Story = { args: { locale: 'ru' } };
export const French: Story = { args: { locale: 'fr' } };
export const Spanish: Story = { args: { locale: 'es' } };
