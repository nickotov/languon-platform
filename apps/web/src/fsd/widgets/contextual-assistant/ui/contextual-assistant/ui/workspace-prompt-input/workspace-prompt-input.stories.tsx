import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Popover, PopoverTrigger } from '@/fsd/shared/ui';
import { WorkspacePromptInput } from './workspace-prompt-input';
import type { PromptValue } from '../../../../lib/prompt-document';

function Example() {
    const [value, setValue] = useState<PromptValue>({
        content: 'Generate Choose meaning using At the library',
        promptMentions: [
            {
                kind: 'exercise',
                activityId: 'V02',
                catalogVersion: 1,
                start: 9,
                end: 23,
            },
            {
                kind: 'block',
                blockId: '00000000-0000-4000-8000-000000000001',
                start: 30,
                end: 44,
            },
        ],
    });
    const [open, setOpen] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    function changeOpen(next: boolean) {
        if (next || !previewOpen) {
            setOpen(next);
        }
    }

    function show() {
        setOpen(true);
    }

    function close() {
        setOpen(false);
    }

    function send() {}

    return (
        <Popover open={open} onOpenChange={changeOpen}>
            <form>
                <PopoverTrigger asChild>
                    <button type='button'>Add context</button>
                </PopoverTrigger>
                <WorkspacePromptInput
                    content={value.content}
                    mentions={value.promptMentions}
                    onChange={setValue}
                    locale='en'
                    label='Your question'
                    canSend
                    onSend={send}
                    contextOpen={open}
                    onPreviewOpenChange={setPreviewOpen}
                    onContext={show}
                    onClose={close}
                    texts={<p>Copied Text references</p>}
                    blocks={[
                        {
                            id: '00000000-0000-4000-8000-000000000001',
                            type: 'vocabulary',
                            title: 'At the library',
                        },
                    ]}
                    selectedBlocks={[]}
                />
            </form>
        </Popover>
    );
}

const meta = {
    title: 'Widgets/Contextual assistant/Inline prompt',
    component: Example,
} satisfies Meta<typeof Example>;

export default meta;
export const MixedChips: StoryObj<typeof meta> = {};
