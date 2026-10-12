import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import storyStyles from './badge.stories.module.css';
import { Badge, Chip, Divider } from './badge';

const meta = { title: 'UI/Badge, chip and divider' } satisfies Meta;

export default meta;

export const States: StoryObj = {
    render: () => (
        <div className={storyStyles.examples}>
            <div>
                <Badge tone='success'>Complete</Badge> <Chip>Spanish</Chip>
            </div>
            <Divider />
        </div>
    ),
};
