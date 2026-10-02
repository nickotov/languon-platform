import {
    Archive,
    GraduationCap,
    Layers,
    MessageSquareText,
    MoreHorizontal,
    Pencil,
} from 'lucide-react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Menu } from './menu';
const meta = { component: Menu, title: 'UI/Menu' } satisfies Meta<typeof Menu>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: {
        items: [
            { label: 'Rename', onSelect() {} },
            { disabled: true, label: 'Duplicate', onSelect() {} },
            { label: 'Remove', onSelect() {}, tone: 'danger' },
        ],
        label: 'Passkey actions',
        trigger: 'Actions',
    },
};

export const IconActions: StoryObj<typeof meta> = {
    args: {
        iconOnly: true,
        items: [
            { icon: <Pencil size={16} />, label: 'Edit', onSelect() {} },
            {
                icon: <Archive size={16} />,
                label: 'Archive',
                onSelect() {},
                tone: 'danger',
            },
        ],
        label: 'Dictionary actions',
        trigger: <MoreHorizontal aria-hidden='true' size={18} />,
    },
};

export const Training: StoryObj<typeof meta> = {
    args: {
        heading: 'Train with',
        label: 'Train',
        placement: 'top-end',
        variant: 'secondary',
        showChevron: true,
        trigger: (
            <span className='inline-flex items-center gap-2'>
                <GraduationCap aria-hidden size={16} />
                Train
            </span>
        ),
        items: [
            { label: 'Cards', icon: <Layers size={16} />, onSelect() {} },
            {
                label: 'Sentences',
                hint: 'Coming soon',
                disabled: true,
                icon: <MessageSquareText size={16} />,
                onSelect() {},
            },
        ],
    },
};
