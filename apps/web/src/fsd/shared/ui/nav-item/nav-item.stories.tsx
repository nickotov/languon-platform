import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import storyStyles from './nav-item.stories.module.css';
import { BookOpenIcon } from 'lucide-react';
import { NavItem } from './nav-item';

export default { title: 'UI/Nav item', component: NavItem } satisfies Meta<
    typeof NavItem
>;

export const States: StoryObj<typeof NavItem> = {
    render: () => (
        <nav className={storyStyles.examples}>
            <NavItem
                href='#'
                icon={BookOpenIcon}
                label='Lessons'
                active
                badge={4}
            />
            <NavItem href='#' icon={BookOpenIcon} label='Vocabulary' />
            <NavItem icon={BookOpenIcon} label='Locked' disabled />
        </nav>
    ),
};
