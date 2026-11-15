import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PromptPicker } from './prompt-picker';
import styles from '../../../styles/contextual-assistant-prompt-common.module.css';

function Example() {
    const [selection, setSelection] = useState(
        'Choose an exercise or a document block.',
    );

    function select(value: string) {
        setSelection(`Selected: ${value}`);
    }

    function preview(value: string) {
        setSelection(`Preview: ${value}`);
    }

    function close() {
        setSelection('Picker closed');
    }

    return (
        <>
            <div className={styles.overlay}>
                <PromptPicker
                    locale='en'
                    blocks={[
                        {
                            id: 'words',
                            type: 'vocabulary',
                            title: 'At the library · useful words',
                        },
                        {
                            id: 'lesson',
                            type: 'bilingual-text',
                            title: 'A conversation with the librarian',
                        },
                    ]}
                    texts={<p>Your copied Texts appear here.</p>}
                    onExercise={select}
                    onBlock={select}
                    onPreview={preview}
                    onClose={close}
                />
            </div>
            <p role='status'>{selection}</p>
        </>
    );
}

const meta = {
    title: 'Widgets/Contextual assistant/Prompt command menu',
    component: Example,
} satisfies Meta<typeof Example>;

export default meta;
export const BrowseAndSearch: StoryObj<typeof meta> = {};
