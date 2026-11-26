import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Button } from '@/fsd/shared/ui';
import { editorInsertCopy } from '../../lib/editor-insert-copy';
import type { EditorEmbedKind } from '../../hooks/use-editor-embed-insertion';
import { InsertEmbedDialog } from './insert-embed-dialog';

function Example({ kind }: { kind: EditorEmbedKind }) {
    const [open, setOpen] = useState(true);
    const copy = editorInsertCopy('en');

    function show() {
        setOpen(true);
    }

    function close() {
        setOpen(false);
    }

    function insert() {
        close();

        return true;
    }

    return (
        <>
            <Button onClick={show}>{copy[kind]}</Button>
            {open && (
                <InsertEmbedDialog
                    kind={kind}
                    copy={copy}
                    onInsert={insert}
                    onClose={close}
                />
            )}
        </>
    );
}

const meta = {
    title: 'Knowledge/Insert embed',
    component: Example,
} satisfies Meta<typeof Example>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Website: Story = { args: { kind: 'websiteEmbed' } };
export const Image: Story = { args: { kind: 'imageEmbed' } };
