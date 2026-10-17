import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Save } from 'lucide-react';
import storyStyles from './button.stories.module.css';
import { Button } from './button';

const meta = { component: Button, title: 'UI/Button' } satisfies Meta<
    typeof Button
>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { children: 'Continue' } };

export const Secondary: Story = {
    args: { children: 'Practice later', variant: 'secondary' },
};

export const Ghost: Story = {
    args: { children: 'Dismiss', variant: 'ghost' },
};

export const Loading: Story = {
    args: { children: 'Saving lesson', loading: true },
};

export const Disabled: Story = {
    args: { children: 'Continue', disabled: true },
};

export const Destructive: Story = {
    args: { children: 'Delete account', variant: 'danger' },
};

export const PressedStates: Story = {
    args: { children: 'Pressed' },
    render: () => (
        <div className={storyStyles.controls}>
            <Button data-state='pressed'>Primary pressed</Button>
            <Button data-state='pressed' variant='secondary'>
                Secondary pressed
            </Button>
            <Button data-state='pressed' variant='ghost'>
                Ghost pressed
            </Button>
            <Button data-state='pressed' variant='danger'>
                Destructive pressed
            </Button>
        </div>
    ),
};

export const ControlSizes: Story = {
    args: { children: 'Continue' },
    render: () => (
        <div className={storyStyles.controls2}>
            <Button size='compact'>Compact</Button>
            <Button size='default'>Default</Button>
            <Button size='large'>Large</Button>
        </div>
    ),
};

export const MixedLanguage: Story = {
    args: { children: 'Продолжить · Continue', size: 'large' },
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const ResponsiveIconAction: Story = {
    args: {
        children: 'Сохранить · Save',
        desktopIconOnly: true,
        leadingIcon: <Save size={16} aria-hidden />,
    },
};

export const ResponsiveIconActionLoading: Story = {
    args: { ...ResponsiveIconAction.args, loading: true },
};

export const ResponsiveIconActionDisabled: Story = {
    args: { ...ResponsiveIconAction.args, disabled: true },
};
