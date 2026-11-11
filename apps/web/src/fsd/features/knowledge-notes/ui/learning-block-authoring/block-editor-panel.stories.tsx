import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState, type FormEvent } from 'react';

import { Button } from '@/fsd/shared/ui';
import { LibrarySaveFooter } from '../library-copy/library-save-footer';
import { libraryLabels } from '../library-copy/library-labels';
import { BlockEditorFooter } from './block-editor-footer';
import { BlockEditorPanel } from './block-editor-panel';
import { localizedBlockLabels } from './block-locales';

const meta = {
    title: 'Knowledge/Block editor panel',
    component: BlockEditorPanel,
} satisfies Meta<typeof BlockEditorPanel>;

export default meta;

function FooterPanel({
    discard = false,
    library = false,
    previewReady = true,
}: {
    discard?: boolean;
    library?: boolean;
    previewReady?: boolean;
}) {
    const [open, setOpen] = useState(true);
    const [confirming, setConfirming] = useState(discard);
    const [previewed, setPreviewed] = useState(previewReady);
    const labels = localizedBlockLabels('ru');
    const saveLabels = libraryLabels('ru');

    function show() {
        setConfirming(discard);
        setPreviewed(previewReady);
        setOpen(true);
    }

    function close() {
        setOpen(false);
    }

    function keepEditing() {
        setConfirming(false);
    }

    function requestClose() {
        setConfirming(true);
    }

    function preparePreview(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPreviewed(true);
    }

    const panelClose = library ? close : requestClose;

    const footer = library ? (
        <LibrarySaveFooter
            labels={saveLabels}
            busy={false}
            saved={false}
            previewReady={previewed}
            previewDisabled={false}
            formId='library-preview-story'
            onClose={close}
            onCommit={close}
        />
    ) : (
        <BlockEditorFooter
            confirming={confirming}
            dirty
            labels={labels}
            keepEditing={keepEditing}
            onClose={close}
            requestClose={requestClose}
            onApply={close}
        />
    );

    return open ? (
        <BlockEditorPanel
            kind='grammar'
            title='Редактирование учебного материала'
            subtitle='Краткие действия в узкой панели'
            labels={labels}
            onClose={panelClose}
            footer={footer}
        >
            <form id='library-preview-story' onSubmit={preparePreview}>
                <p>
                    На компьютере кнопки остаются в одном ряду. Подсказка над
                    кнопками сохраняет доступное для действий пространство.
                </p>
            </form>
        </BlockEditorPanel>
    ) : (
        <Button onClick={show}>Открыть редактор</Button>
    );
}

export const LongLocalizedActions: StoryObj = {
    render: () => <FooterPanel />,
};

export const DiscardConfirmation: StoryObj = {
    render: () => <FooterPanel discard />,
};

export const LibrarySaveLongLabels: StoryObj = {
    render: () => <FooterPanel library />,
};

export const LibraryPreviewLongLabels: StoryObj = {
    render: () => <FooterPanel library previewReady={false} />,
};
