import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '../button/button';
import { PanelPage } from './panel-page';
import { PanelPageHost } from '../panel-page-host/panel-page-host';

const meta = { title: 'UI/PanelPage', component: PanelPage } satisfies Meta<
    typeof PanelPage
>;

export default meta;

function Example() {
    const [open, setOpen] = useState(false);

    return (
        <PanelPageHost>
            <label>
                Chat draft{' '}
                <textarea defaultValue='What should we practise next?' />
            </label>
            <Button onClick={() => setOpen(true)}>Review lesson</Button>
            {open && (
                <PanelPage
                    title='Review lesson'
                    backLabel='Back to chat'
                    onBack={() => setOpen(false)}
                >
                    <h3>Reading</h3>
                    <p>Les pronoms compléments remplacent un groupe nominal.</p>
                </PanelPage>
            )}
        </PanelPageHost>
    );
}

export const ReturnToDraft: StoryObj = { render: Example };
