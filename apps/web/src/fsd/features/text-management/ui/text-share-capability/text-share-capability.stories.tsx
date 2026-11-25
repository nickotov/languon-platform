import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TextShareCapability } from './text-share-capability';

const path = '/shared/texts/example#example-local-capability';

const meta = {
    title: 'Features/Text sharing/Link',
    component: TextShareCapability,
    args: {
        path,
        url: `http://localhost:3333${path}`,
        copied: false,
        copyError: false,
        fieldRef: null,
        onCopy: async () => undefined,
    },
} satisfies Meta<typeof TextShareCapability>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Copied: Story = { args: { copied: true } };
export const ManualCopy: Story = { args: { copyError: true } };
